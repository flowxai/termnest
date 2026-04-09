use ignore::gitignore::Gitignore;
use notify::{RecommendedWatcher, RecursiveMode, Watcher, Event as NotifyEvent};
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::UNIX_EPOCH;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub ignored: bool,
}

fn build_gitignore(project_root: &Path) -> Option<Gitignore> {
    let gitignore_path = project_root.join(".gitignore");
    if !gitignore_path.exists() {
        return None;
    }
    let (gi, _err) = Gitignore::new(&gitignore_path);
    Some(gi)
}

const ALWAYS_IGNORE: &[&str] = &[".git", "node_modules", "target", ".next", "dist", "__pycache__", ".superpowers"];

#[cfg(test)]
fn should_ignore(name: &str, full_path: &Path, is_dir: bool, gitignore: &Option<Gitignore>) -> bool {
    if is_dir && ALWAYS_IGNORE.contains(&name) {
        return true;
    }
    if let Some(gi) = gitignore {
        return gi.matched(full_path, is_dir).is_ignore();
    }
    false
}

#[tauri::command]
pub fn list_directory(project_root: String, path: String) -> Result<Vec<FileEntry>, String> {
    let dir = Path::new(&path);
    if !dir.is_dir() {
        return Err(format!("Not a directory: {}", path));
    }
    let gitignore = build_gitignore(Path::new(&project_root));
    let mut entries: Vec<FileEntry> = fs::read_dir(dir)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let name = entry.file_name().to_string_lossy().to_string();
            let is_dir = entry.file_type().ok()?.is_dir();
            let full_path = entry.path();
            // ALWAYS_IGNORE 目录仍然完全隐藏
            if is_dir && ALWAYS_IGNORE.contains(&name.as_str()) {
                return None;
            }
            let ignored = if let Some(gi) = &gitignore {
                gi.matched(&full_path, is_dir).is_ignore()
            } else {
                false
            };
            Some(FileEntry {
                name,
                path: full_path.to_string_lossy().to_string(),
                is_dir,
                ignored,
            })
        })
        .collect();
    entries.sort_by(|a, b| {
        b.is_dir.cmp(&a.is_dir)
            .then_with(|| a.ignored.cmp(&b.ignored))
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(entries)
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FsChangePayload {
    project_path: String,
    path: String,
    kind: String,
}

pub struct FsWatcherManager {
    watchers: Arc<Mutex<HashMap<String, RecommendedWatcher>>>,
}

impl FsWatcherManager {
    pub fn new() -> Self {
        Self { watchers: Arc::new(Mutex::new(HashMap::new())) }
    }
}

#[tauri::command]
pub fn watch_directory(
    app: AppHandle,
    state: tauri::State<'_, FsWatcherManager>,
    path: String,
    project_path: String,
) -> Result<(), String> {
    let watch_path = PathBuf::from(&path);
    let project_path_clone = project_path.clone();
    let app_clone = app.clone();

    let mut watcher = notify::recommended_watcher(move |res: Result<NotifyEvent, _>| {
        if let Ok(event) = res {
            for p in &event.paths {
                let _ = app_clone.emit("fs-change", FsChangePayload {
                    project_path: project_path_clone.clone(),
                    path: p.to_string_lossy().to_string(),
                    kind: format!("{:?}", event.kind),
                });
            }
        }
    }).map_err(|e| e.to_string())?;

    watcher.watch(&watch_path, RecursiveMode::NonRecursive).map_err(|e| e.to_string())?;

    let mut watchers = state.watchers.lock().unwrap();
    watchers.insert(path, watcher);
    Ok(())
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileContentResult {
    pub content: String,
    pub is_binary: bool,
    pub too_large: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileMetadataResult {
    pub is_binary: bool,
    pub too_large: bool,
    pub modified_ms: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteFileResult {
    pub modified_ms: u64,
}

const MAX_FILE_VIEW_SIZE: u64 = 1_048_576; // 1MB

fn metadata_modified_ms(metadata: &fs::Metadata) -> Result<u64, String> {
    let modified = metadata.modified().map_err(|e| e.to_string())?;
    let duration = modified.duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?;
    Ok(duration.as_millis() as u64)
}

fn inspect_file(path: &Path) -> Result<FileMetadataResult, String> {
    if !path.is_file() {
        return Err(format!("不是文件: {}", path.display()));
    }

    let metadata = fs::metadata(path).map_err(|e| e.to_string())?;
    let modified_ms = metadata_modified_ms(&metadata)?;
    if metadata.len() > MAX_FILE_VIEW_SIZE {
        return Ok(FileMetadataResult {
            is_binary: false,
            too_large: true,
            modified_ms,
        });
    }

    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    Ok(FileMetadataResult {
        is_binary: String::from_utf8(bytes).is_err(),
        too_large: false,
        modified_ms,
    })
}

#[tauri::command]
pub fn read_file_content(path: String) -> Result<FileContentResult, String> {
    let p = Path::new(&path);
    let inspection = inspect_file(p)?;
    if inspection.too_large {
        return Ok(FileContentResult { content: String::new(), is_binary: false, too_large: true });
    }
    let bytes = fs::read(p).map_err(|e| e.to_string())?;
    match String::from_utf8(bytes) {
        Ok(s) => Ok(FileContentResult { content: s, is_binary: false, too_large: false }),
        Err(_) => Ok(FileContentResult { content: String::new(), is_binary: true, too_large: false }),
    }
}

#[tauri::command]
pub fn get_file_metadata(path: String) -> Result<FileMetadataResult, String> {
    inspect_file(Path::new(&path))
}

#[tauri::command]
pub fn write_file_content(
    path: String,
    content: String,
    expected_modified_ms: Option<u64>,
) -> Result<WriteFileResult, String> {
    let p = Path::new(&path);
    if !p.is_file() {
        return Err(format!("不是文件: {}", path));
    }

    let current_metadata = fs::metadata(p).map_err(|e| e.to_string())?;
    let current_modified_ms = metadata_modified_ms(&current_metadata)?;
    if let Some(expected) = expected_modified_ms {
        if expected != current_modified_ms {
            return Err("文件已被外部修改，请先重新加载".into());
        }
    }

    fs::write(p, content).map_err(|e| e.to_string())?;
    let updated_metadata = fs::metadata(p).map_err(|e| e.to_string())?;
    Ok(WriteFileResult {
        modified_ms: metadata_modified_ms(&updated_metadata)?,
    })
}

#[tauri::command]
pub fn create_file(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.exists() {
        return Err(format!("已存在: {}", path));
    }
    fs::write(p, "").map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_directory(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.exists() {
        return Err(format!("已存在: {}", path));
    }
    fs::create_dir(p).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn unwatch_directory(state: tauri::State<'_, FsWatcherManager>, path: String) -> Result<(), String> {
    let mut watchers = state.watchers.lock().unwrap();
    watchers.remove(&path);
    Ok(())
}

#[tauri::command]
pub fn rename_entry(old_path: String, new_name: String) -> Result<String, String> {
    let p = Path::new(&old_path);
    if !p.exists() {
        return Err(format!("路径不存在: {}", old_path));
    }
    let parent = p.parent().ok_or("无法获取父目录")?;
    let new_path = parent.join(&new_name);
    if new_path.exists() {
        return Err(format!("目标已存在: {}", new_path.display()));
    }
    fs::rename(p, &new_path).map_err(|e| e.to_string())?;
    Ok(new_path.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::SystemTime;
    use std::time::Duration;

    fn temp_file_path(name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("mini-term-{}-{}-{}", std::process::id(), nanos, name))
    }

    #[test]
    fn should_ignore_node_modules() {
        let path = Path::new("node_modules");
        assert!(should_ignore("node_modules", path, true, &None));
        let git_path = Path::new(".git");
        assert!(should_ignore(".git", git_path, true, &None));
    }

    #[test]
    fn should_not_ignore_src() {
        let path = Path::new("src");
        assert!(!should_ignore("src", path, true, &None));
    }

    #[test]
    fn get_file_metadata_for_text_file() {
        let path = temp_file_path("meta.txt");
        fs::write(&path, "hello").unwrap();

        let meta = get_file_metadata(path.to_string_lossy().to_string()).unwrap();
        assert!(!meta.is_binary);
        assert!(!meta.too_large);
        assert!(meta.modified_ms > 0);

        fs::remove_file(path).unwrap();
    }

    #[test]
    fn write_file_content_rejects_stale_modified_time() {
        let path = temp_file_path("write.txt");
        fs::write(&path, "before").unwrap();
        let current = get_file_metadata(path.to_string_lossy().to_string()).unwrap().modified_ms;

        std::thread::sleep(Duration::from_millis(2));
        fs::write(&path, "external").unwrap();

        let result = write_file_content(
            path.to_string_lossy().to_string(),
            "after".into(),
            Some(current),
        );
        assert!(result.is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), "external");

        fs::remove_file(path).unwrap();
    }

    #[test]
    fn write_file_content_updates_modified_time() {
        let path = temp_file_path("write-ok.txt");
        fs::write(&path, "before").unwrap();
        let current = get_file_metadata(path.to_string_lossy().to_string()).unwrap().modified_ms;

        std::thread::sleep(Duration::from_millis(2));
        let result = write_file_content(
            path.to_string_lossy().to_string(),
            "after".into(),
            Some(current),
        )
        .unwrap();

        assert_eq!(fs::read_to_string(&path).unwrap(), "after");
        assert!(result.modified_ms >= current);

        fs::remove_file(path).unwrap();
    }
}
