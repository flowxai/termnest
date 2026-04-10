mod ai_sessions;
mod config;
mod fs;
mod git;
mod process_monitor;
mod pty;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .manage(pty::PtyManager::new())
        .manage(fs::FsWatcherManager::new())
        .setup(|app| {
            let pty_manager = app.state::<crate::pty::PtyManager>();
            let pty_clone = pty_manager.inner().clone();
            process_monitor::start_monitor(app.handle().clone(), pty_clone);
            if let Some(window) = app.get_webview_window("main") {
                let initial_config = config::load_config_from_disk(&app.handle().clone());
                let _ = config::apply_window_glass_to_window(
                    &window,
                    initial_config.window_glass,
                    initial_config.glass_strength,
                );
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            config::load_config,
            config::save_config,
            config::set_window_glass,
            pty::create_pty,
            pty::attach_pty_output,
            pty::write_pty,
            pty::write_pty_binary,
            pty::resize_pty,
            pty::kill_pty,
            fs::list_directory,
            fs::watch_directory,
            fs::unwatch_directory,
            fs::create_file,
            fs::create_directory,
            fs::read_file_content,
            fs::get_file_metadata,
            fs::write_file_content,
            fs::rename_entry,
            ai_sessions::get_ai_sessions,
            ai_sessions::delete_ai_session,
            git::get_git_status,
            git::get_git_diff,
            git::discover_git_repos,
            git::get_git_log,
            git::get_repo_branches,
            git::get_commit_files,
            git::get_commit_file_diff,
            git::git_pull,
            git::git_push,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
