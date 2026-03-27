mod ai_sessions;
mod config;
mod fs;
mod pty;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(pty::PtyManager::new())
        .manage(fs::FsWatcherManager::new())
        .invoke_handler(tauri::generate_handler![
            config::load_config,
            config::save_config,
            pty::create_pty,
            pty::write_pty,
            pty::resize_pty,
            pty::kill_pty,
            fs::list_directory,
            fs::watch_directory,
            fs::unwatch_directory,
            ai_sessions::get_ai_sessions,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
