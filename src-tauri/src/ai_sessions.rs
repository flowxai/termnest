use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSession {
    pub id: String,
    pub session_type: String, // "claude" | "codex"
    pub title: String,
    pub timestamp: String, // ISO 8601
}

/// 获取用户 home 目录
fn home_dir() -> Option<PathBuf> {
    dirs::home_dir()
}

/// 将项目路径编码为 Claude 项目目录名（`:` `\` `/` → `-`）
fn encode_project_path(project_path: &str) -> String {
    project_path
        .replace(':', "-")
        .replace('\\', "-")
        .replace('/', "-")
}

/// 路径统一化（小写 + 反斜杠，去尾部斜杠），用于 Windows 路径比较
fn normalize_path(path: &str) -> String {
    path.replace('/', "\\")
        .to_lowercase()
        .trim_end_matches('\\')
        .to_string()
}

// ─── Claude Sessions ───────────────────────────────────────────

fn get_claude_sessions(project_path: &str) -> Vec<AiSession> {
    get_claude_sessions_in_home(
        home_dir().as_deref(),
        project_path,
    )
}

fn get_claude_sessions_in_home(home: Option<&Path>, project_path: &str) -> Vec<AiSession> {
    let home = match home {
        Some(h) => h,
        None => return vec![],
    };
    let home = home.to_path_buf();

    let encoded = encode_project_path(project_path);
    let sessions_dir = home.join(".claude").join("projects").join(&encoded);

    if !sessions_dir.exists() {
        return vec![];
    }

    let mut sessions = Vec::new();

    let entries = match fs::read_dir(&sessions_dir) {
        Ok(e) => e,
        Err(_) => return vec![],
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
            continue;
        }

        let id = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();

        let (title, timestamp) = read_claude_session_info(&path);

        sessions.push(AiSession {
            id,
            session_type: "claude".to_string(),
            title,
            timestamp,
        });
    }

    sessions
}

/// 读取 Claude JSONL，提取第一条 user message 的内容和时间戳
fn read_claude_session_info(path: &Path) -> (String, String) {
    let file = match fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return ("Untitled".into(), String::new()),
    };

    let reader = BufReader::new(file);
    let mut title: Option<String> = None;
    let mut latest_timestamp = String::new();

    for line in reader.lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => continue,
        };

        let obj: serde_json::Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => continue,
        };

        if let Some(timestamp) = obj.get("timestamp").and_then(|t| t.as_str()) {
            if timestamp > latest_timestamp.as_str() {
                latest_timestamp = timestamp.to_string();
            }
        }

        if title.is_some() || obj.get("type").and_then(|t| t.as_str()) != Some("user") {
            continue;
        }

        let content_val = obj.pointer("/message/content");
        let content = if let Some(s) = content_val.and_then(|c| c.as_str()) {
            s.to_string()
        } else if let Some(arr) = content_val.and_then(|c| c.as_array()) {
            // 多模态消息：取第一个 text block
            arr.iter()
                .filter_map(|item| {
                    if item.get("type").and_then(|t| t.as_str()) == Some("text") {
                        item.get("text").and_then(|t| t.as_str()).map(String::from)
                    } else {
                        None
                    }
                })
                .next()
                .unwrap_or_else(|| "Untitled".into())
        } else {
            "Untitled".into()
        };

        // 跳过系统注入消息（如 /clear 等本地命令产生的 <local-command-caveat> 等）
        let trimmed = content.trim_start();
        if trimmed.starts_with('<') {
            continue;
        }

        // 截断到 100 字符
        title = Some(content.chars().take(100).collect());
    }

    (title.unwrap_or_else(|| "Untitled".into()), latest_timestamp)
}

// ─── Codex Sessions ────────────────────────────────────────────

fn get_codex_sessions(project_path: &str) -> Vec<AiSession> {
    get_codex_sessions_in_home(
        home_dir().as_deref(),
        project_path,
    )
}

fn get_codex_sessions_in_home(home: Option<&Path>, project_path: &str) -> Vec<AiSession> {
    let home = match home {
        Some(h) => h,
        None => return vec![],
    };
    let home = home.to_path_buf();

    let codex_dir = home.join(".codex");
    let sessions_dir = codex_dir.join("sessions");

    if !sessions_dir.exists() {
        return vec![];
    }

    // 加载 session_index.jsonl 中的 thread_name 映射
    let thread_names = load_codex_thread_names(&codex_dir);

    let mut sessions = Vec::new();
    let normalized_project = normalize_path(project_path);

    walk_codex_sessions(&sessions_dir, &normalized_project, &thread_names, &mut sessions);

    sessions
}

fn find_claude_session_paths(home: &Path, project_path: &str, session_id: &str) -> (PathBuf, PathBuf) {
    let encoded = encode_project_path(project_path);
    let project_dir = home.join(".claude").join("projects").join(encoded);
    (
        project_dir.join(format!("{session_id}.jsonl")),
        project_dir.join(session_id),
    )
}

fn codex_session_file_matches(path: &Path, normalized_project: &str, session_id: &str) -> bool {
    let file = match fs::File::open(path) {
        Ok(file) => file,
        Err(_) => return false,
    };
    let reader = BufReader::new(file);

    for line in reader.lines().take(5).flatten() {
        let obj: serde_json::Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => continue,
        };

        if obj.get("type").and_then(|t| t.as_str()) != Some("session_meta") {
            continue;
        }

        let cwd = obj
            .pointer("/payload/cwd")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let id = obj
            .pointer("/payload/id")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        return normalize_path(cwd) == normalized_project && id == session_id;
    }

    false
}

fn find_codex_session_file(home: &Path, project_path: &str, session_id: &str) -> Option<PathBuf> {
    let sessions_dir = home.join(".codex").join("sessions");
    if !sessions_dir.exists() {
        return None;
    }

    let normalized_project = normalize_path(project_path);
    let mut stack = vec![sessions_dir];

    while let Some(dir) = stack.pop() {
        let entries = fs::read_dir(&dir).ok()?;
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
                continue;
            }
            if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
                continue;
            }
            if codex_session_file_matches(&path, &normalized_project, session_id) {
                return Some(path);
            }
        }
    }

    None
}

fn remove_codex_index_entry(home: &Path, session_id: &str) -> Result<(), String> {
    let index_path = home.join(".codex").join("session_index.jsonl");
    if !index_path.exists() {
        return Ok(());
    }

    let content = fs::read_to_string(&index_path).map_err(|e| e.to_string())?;
    let filtered: Vec<&str> = content
        .lines()
        .filter(|line| {
            serde_json::from_str::<serde_json::Value>(line)
                .ok()
                .and_then(|obj| obj.get("id").and_then(|v| v.as_str()).map(|id| id != session_id))
                .unwrap_or(true)
        })
        .collect();

    let output = if filtered.is_empty() {
        String::new()
    } else {
        format!("{}\n", filtered.join("\n"))
    };
    fs::write(index_path, output).map_err(|e| e.to_string())
}

fn delete_ai_session_from_home(
    home: &Path,
    project_path: &str,
    session_type: &str,
    session_id: &str,
) -> Result<(), String> {
    match session_type {
        "claude" => {
            let (main_file, session_dir) = find_claude_session_paths(home, project_path, session_id);
            let mut removed_any = false;

            if main_file.exists() {
                fs::remove_file(&main_file).map_err(|e| e.to_string())?;
                removed_any = true;
            }
            if session_dir.exists() {
                fs::remove_dir_all(&session_dir).map_err(|e| e.to_string())?;
                removed_any = true;
            }

            if !removed_any {
                return Err("Claude 会话文件不存在".into());
            }
            Ok(())
        }
        "codex" => {
            let session_file = find_codex_session_file(home, project_path, session_id)
                .ok_or_else(|| "Codex 会话文件不存在".to_string())?;
            fs::remove_file(&session_file).map_err(|e| e.to_string())?;
            remove_codex_index_entry(home, session_id)?;
            Ok(())
        }
        _ => Err("不支持的会话类型".into()),
    }
}

/// 加载 Codex session_index.jsonl → { id: thread_name }
fn load_codex_thread_names(codex_dir: &Path) -> HashMap<String, String> {
    let index_path = codex_dir.join("session_index.jsonl");
    let mut map = HashMap::new();

    let file = match fs::File::open(&index_path) {
        Ok(f) => f,
        Err(_) => return map,
    };

    let reader = BufReader::new(file);
    for line in reader.lines().flatten() {
        if let Ok(obj) = serde_json::from_str::<serde_json::Value>(&line) {
            if let (Some(id), Some(name)) = (
                obj.get("id").and_then(|v| v.as_str()),
                obj.get("thread_name").and_then(|v| v.as_str()),
            ) {
                map.insert(id.to_string(), name.to_string());
            }
        }
    }

    map
}

/// 递归遍历 sessions/<year>/<month>/<day>/ 目录
fn walk_codex_sessions(
    dir: &Path,
    normalized_project: &str,
    thread_names: &HashMap<String, String>,
    sessions: &mut Vec<AiSession>,
) {
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            walk_codex_sessions(&path, normalized_project, thread_names, sessions);
        } else if path.extension().and_then(|e| e.to_str()) == Some("jsonl") {
            if let Some(session) = try_read_codex_session(&path, normalized_project, thread_names) {
                sessions.push(session);
            }
        }
    }
}

/// 读取 Codex session 文件，匹配 cwd 后返回 AiSession
fn try_read_codex_session(
    path: &Path,
    normalized_project: &str,
    thread_names: &HashMap<String, String>,
) -> Option<AiSession> {
    let file = fs::File::open(path).ok()?;
    let reader = BufReader::new(file);

    let mut matched_id = None;
    let mut latest_timestamp = String::new();

    let mut lines_iter = reader.lines();

    // 第一遍：前 5 行找 session_meta，匹配 cwd
    for line in (&mut lines_iter).take(5) {
        let line = line.ok()?;
        let obj: serde_json::Value = serde_json::from_str(&line).ok()?;

        if obj.get("type").and_then(|t| t.as_str()) != Some("session_meta") {
            continue;
        }

        let cwd = obj
            .pointer("/payload/cwd")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        if normalize_path(cwd) != normalized_project {
            return None;
        }

        matched_id = Some(
            obj.pointer("/payload/id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
        );

        latest_timestamp = obj
            .get("timestamp")
            .or_else(|| obj.pointer("/payload/timestamp"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        break;
    }

    let id = matched_id?;

    // 先查 session_index 中的 thread_name
    let mut title = thread_names.get(&id).cloned().unwrap_or_default();

    // 如果 thread_name 为空，从后续行中找第一条真实用户消息
    if title.is_empty() {
        for (index, line) in lines_iter.enumerate() {
            let line = match line {
                Ok(l) => l,
                Err(_) => continue,
            };
            let obj: serde_json::Value = match serde_json::from_str(&line) {
                Ok(v) => v,
                Err(_) => continue,
            };

            if let Some(timestamp) = obj.get("timestamp").and_then(|v| v.as_str()) {
                if timestamp > latest_timestamp.as_str() {
                    latest_timestamp = timestamp.to_string();
                }
            }

            if index >= 30 {
                continue;
            }

            if obj.get("type").and_then(|t| t.as_str()) != Some("response_item") {
                continue;
            }
            if obj.pointer("/payload/role").and_then(|v| v.as_str()) != Some("user") {
                continue;
            }

            // 遍历 content blocks，找第一个非系统注入的 text
            if let Some(arr) = obj.pointer("/payload/content").and_then(|v| v.as_array()) {
                for item in arr {
                    if item.get("type").and_then(|t| t.as_str()) != Some("input_text") {
                        continue;
                    }
                    let text = item.get("text").and_then(|t| t.as_str()).unwrap_or("");
                    let trimmed = text.trim_start();
                    if !trimmed.is_empty()
                        && !trimmed.starts_with('<')
                        && !trimmed.starts_with("# AGENTS.md")
                    {
                        title = trimmed.chars().take(100).collect();
                        break;
                    }
                }
            }
        }

        if title.is_empty() {
            title = "Untitled".into();
        }
    } else {
        for line in lines_iter {
            let line = match line {
                Ok(l) => l,
                Err(_) => continue,
            };
            let obj: serde_json::Value = match serde_json::from_str(&line) {
                Ok(v) => v,
                Err(_) => continue,
            };
            if let Some(timestamp) = obj.get("timestamp").and_then(|v| v.as_str()) {
                if timestamp > latest_timestamp.as_str() {
                    latest_timestamp = timestamp.to_string();
                }
            }
        }
    }

    let timestamp = latest_timestamp;

    Some(AiSession {
        id,
        session_type: "codex".to_string(),
        title,
        timestamp,
    })
}

// ─── Tauri Command ─────────────────────────────────────────────

#[tauri::command]
pub fn get_ai_sessions(project_path: String) -> Result<Vec<AiSession>, String> {
    let mut sessions = Vec::new();

    sessions.extend(get_claude_sessions(&project_path));
    sessions.extend(get_codex_sessions(&project_path));

    // 按时间戳降序（最新在前）
    sessions.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));

    Ok(sessions)
}

#[tauri::command]
pub fn delete_ai_session(
    project_path: String,
    session_type: String,
    session_id: String,
) -> Result<(), String> {
    let home = home_dir().ok_or_else(|| "无法获取用户目录".to_string())?;
    delete_ai_session_from_home(&home, &project_path, &session_type, &session_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir(name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("termnest-ai-sessions-{}-{}-{}", std::process::id(), nanos, name))
    }

    #[test]
    fn delete_claude_session_removes_main_file_and_subagents_dir() {
        let home = temp_dir("claude");
        let project_path = "/Users/test/project";
        let encoded = encode_project_path(project_path);
        let session_id = "session-123";
        let main_file = home
            .join(".claude")
            .join("projects")
            .join(encoded)
            .join(format!("{session_id}.jsonl"));
        let subagent_dir = home
            .join(".claude")
            .join("projects")
            .join(encode_project_path(project_path))
            .join(session_id);

        fs::create_dir_all(subagent_dir.join("subagents")).unwrap();
        fs::write(&main_file, "{\"type\":\"user\"}\n").unwrap();
        fs::write(subagent_dir.join("subagents").join("agent-a.jsonl"), "{}\n").unwrap();

        delete_ai_session_from_home(&home, project_path, "claude", session_id).unwrap();

        assert!(!main_file.exists());
        assert!(!subagent_dir.exists());
    }

    #[test]
    fn delete_codex_session_removes_rollout_file_and_index_entry() {
        let home = temp_dir("codex");
        let project_path = "/Users/test/project";
        let session_id = "019d5284-5c0e-7662-bdcf-817550dabf2a";
        let session_file = home
            .join(".codex")
            .join("sessions")
            .join("2026")
            .join("04")
            .join("09")
            .join("rollout-test.jsonl");
        let index_file = home.join(".codex").join("session_index.jsonl");

        fs::create_dir_all(session_file.parent().unwrap()).unwrap();
        fs::create_dir_all(index_file.parent().unwrap()).unwrap();
        fs::write(
            &session_file,
            format!(
                "{{\"timestamp\":\"2026-04-09T08:44:59.279Z\",\"type\":\"session_meta\",\"payload\":{{\"id\":\"{session_id}\",\"timestamp\":\"2026-04-09T08:44:59.279Z\",\"cwd\":\"{project_path}\"}}}}\n"
            ),
        )
        .unwrap();
        fs::write(
            &index_file,
            format!(
                "{{\"id\":\"{session_id}\",\"thread_name\":\"keep me? no\"}}\n{{\"id\":\"other-id\",\"thread_name\":\"keep me\"}}\n"
            ),
        )
        .unwrap();

        delete_ai_session_from_home(&home, project_path, "codex", session_id).unwrap();

        assert!(!session_file.exists());
        let index_content = fs::read_to_string(index_file).unwrap();
        assert!(!index_content.contains(session_id));
        assert!(index_content.contains("other-id"));
    }

    #[test]
    fn claude_session_uses_last_activity_timestamp() {
        let dir = temp_dir("claude-last-activity");
        fs::create_dir_all(&dir).unwrap();
        let file = dir.join("session.jsonl");
        fs::write(
            &file,
            concat!(
                "{\"type\":\"user\",\"timestamp\":\"2026-03-11T07:16:11.025Z\",\"message\":{\"content\":\"first prompt\"}}\n",
                "{\"type\":\"assistant\",\"timestamp\":\"2026-03-11T07:23:53.612Z\",\"message\":{\"content\":[{\"type\":\"text\",\"text\":\"answer\"}]}}\n",
                "{\"type\":\"last-prompt\",\"lastPrompt\":\"later metadata\",\"sessionId\":\"abc\"}\n"
            ),
        )
        .unwrap();

        let (title, timestamp) = read_claude_session_info(&file);
        assert_eq!(title, "first prompt");
        assert_eq!(timestamp, "2026-03-11T07:23:53.612Z");
    }

    #[test]
    fn codex_session_uses_last_activity_timestamp() {
        let dir = temp_dir("codex-last-activity");
        fs::create_dir_all(&dir).unwrap();
        let file = dir.join("rollout.jsonl");
        fs::write(
            &file,
            concat!(
                "{\"timestamp\":\"2026-03-20T15:09:21.662Z\",\"type\":\"session_meta\",\"payload\":{\"id\":\"session-1\",\"timestamp\":\"2026-03-20T15:07:32.987Z\",\"cwd\":\"/Users/test/project\"}}\n",
                "{\"timestamp\":\"2026-03-20T15:09:21.664Z\",\"type\":\"response_item\",\"payload\":{\"type\":\"message\",\"role\":\"user\",\"content\":[{\"type\":\"input_text\",\"text\":\"hello\"}]}}\n",
                "{\"timestamp\":\"2026-03-21T02:29:31.511Z\",\"type\":\"event_msg\",\"payload\":{\"type\":\"task_complete\"}}\n"
            ),
        )
        .unwrap();

        let session =
            try_read_codex_session(&file, &normalize_path("/Users/test/project"), &HashMap::new())
                .unwrap();
        assert_eq!(session.title, "hello");
        assert_eq!(session.timestamp, "2026-03-21T02:29:31.511Z");
    }
}
