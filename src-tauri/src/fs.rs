use notify::{RecommendedWatcher, RecursiveMode, Watcher, Event as NotifyEvent};
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

fn load_gitignore_patterns(project_root: &Path) -> Vec<String> {
    let gitignore_path = project_root.join(".gitignore");
    match fs::read_to_string(&gitignore_path) {
        Ok(content) => content
            .lines()
            .map(|l| l.trim().to_string())
            .filter(|l| !l.is_empty() && !l.starts_with('#'))
            .collect(),
        Err(_) => vec![],
    }
}

fn should_ignore(name: &str, is_dir: bool, patterns: &[String]) -> bool {
    let always_ignore = [".git", "node_modules", "target", ".next", "dist", "__pycache__", ".superpowers"];
    if is_dir && always_ignore.contains(&name) {
        return true;
    }
    for pattern in patterns {
        let p = pattern.trim_end_matches('/');
        if name == p {
            return true;
        }
    }
    false
}

#[tauri::command]
pub fn list_directory(project_root: String, path: String) -> Result<Vec<FileEntry>, String> {
    let dir = Path::new(&path);
    if !dir.is_dir() {
        return Err(format!("Not a directory: {}", path));
    }
    let patterns = load_gitignore_patterns(Path::new(&project_root));
    let mut entries: Vec<FileEntry> = fs::read_dir(dir)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let name = entry.file_name().to_string_lossy().to_string();
            let is_dir = entry.file_type().ok()?.is_dir();
            if should_ignore(&name, is_dir, &patterns) {
                return None;
            }
            Some(FileEntry {
                name,
                path: entry.path().to_string_lossy().to_string(),
                is_dir,
            })
        })
        .collect();
    entries.sort_by(|a, b| {
        b.is_dir.cmp(&a.is_dir).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
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

#[tauri::command]
pub fn unwatch_directory(state: tauri::State<'_, FsWatcherManager>, path: String) -> Result<(), String> {
    let mut watchers = state.watchers.lock().unwrap();
    watchers.remove(&path);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_ignore_node_modules() {
        assert!(should_ignore("node_modules", true, &[]));
        assert!(should_ignore(".git", true, &[]));
    }

    #[test]
    fn should_not_ignore_src() {
        assert!(!should_ignore("src", true, &[]));
    }
}
