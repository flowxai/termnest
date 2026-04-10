use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

// 注意：variant 顺序不可调换！untagged 按声明顺序尝试匹配
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ProjectTreeItem {
    ProjectId(String),
    Group(ProjectGroup),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectGroup {
    pub id: String,
    pub name: String,
    pub collapsed: bool,
    pub children: Vec<ProjectTreeItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OldProjectGroup {
    pub id: String,
    pub name: String,
    pub collapsed: bool,
    pub project_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub projects: Vec<ProjectConfig>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub project_tree: Option<Vec<ProjectTreeItem>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub project_groups: Option<Vec<OldProjectGroup>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub project_ordering: Option<Vec<String>>,
    pub default_shell: String,
    pub available_shells: Vec<ShellConfig>,
    #[serde(default = "default_ui_font_size")]
    pub ui_font_size: f64,
    #[serde(default = "default_terminal_font_size")]
    pub terminal_font_size: f64,
    #[serde(default)]
    pub layout_sizes: Option<Vec<f64>>,
    #[serde(default)]
    pub middle_column_sizes: Option<Vec<f64>>,
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default = "legacy_ui_style")]
    pub ui_style: String,
    #[serde(default)]
    pub window_glass: bool,
    #[serde(default = "default_glass_strength")]
    pub glass_strength: f64,
    #[serde(default = "default_terminal_follow_theme")]
    pub terminal_follow_theme: bool,
    #[serde(default)]
    pub proxy: ProxyConfig,
    #[serde(default)]
    pub session_aliases: HashMap<String, HashMap<String, String>>,
    #[serde(default)]
    pub session_pins: HashMap<String, HashMap<String, bool>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedPane {
    pub shell_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum SavedSplitNode {
    Leaf {
        /// 旧格式（单个 pane），仅用于反序列化兼容，序列化时跳过
        #[serde(default, skip_serializing)]
        pane: Option<SavedPane>,
        /// 新格式（pane 数组），前端始终使用此字段
        #[serde(default)]
        panes: Vec<SavedPane>,
    },
    Split {
        direction: String,
        children: Vec<SavedSplitNode>,
        sizes: Vec<f64>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedTab {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub custom_title: Option<String>,
    pub split_layout: SavedSplitNode,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedProjectLayout {
    pub tabs: Vec<SavedTab>,
    pub active_tab_index: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectConfig {
    pub id: String,
    pub name: String,
    pub path: String,
    #[serde(default)]
    pub saved_layout: Option<SavedProjectLayout>,
    #[serde(default)]
    pub expanded_dirs: Vec<String>,
    #[serde(default = "default_project_proxy_mode")]
    pub proxy_mode: ProjectProxyMode,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub proxy_override: Option<ProxyOverrideConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellConfig {
    pub name: String,
    pub command: String,
    pub args: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProxyConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub all_proxy: String,
    #[serde(default)]
    pub http_proxy: String,
    #[serde(default)]
    pub https_proxy: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProxyOverrideConfig {
    #[serde(default)]
    pub all_proxy: String,
    #[serde(default)]
    pub http_proxy: String,
    #[serde(default)]
    pub https_proxy: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum ProjectProxyMode {
    #[default]
    Inherit,
    Enabled,
    Disabled,
}

fn default_ui_font_size() -> f64 { 13.0 }
fn default_terminal_font_size() -> f64 { 14.0 }
fn default_theme() -> String { "auto".into() }
fn default_ui_style() -> String { "pro".into() }
fn legacy_ui_style() -> String { "classic".into() }
fn default_glass_strength() -> f64 { 34.0 }
fn default_terminal_follow_theme() -> bool { true }
fn default_project_proxy_mode() -> ProjectProxyMode { ProjectProxyMode::Inherit }

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            projects: vec![],
            project_tree: None,
            project_groups: None,
            project_ordering: None,
            default_shell: default_shell_name(),
            available_shells: default_shells(),
            ui_font_size: default_ui_font_size(),
            terminal_font_size: default_terminal_font_size(),
            layout_sizes: None,
            middle_column_sizes: None,
            theme: default_theme(),
            ui_style: default_ui_style(),
            window_glass: false,
            glass_strength: default_glass_strength(),
            terminal_follow_theme: default_terminal_follow_theme(),
            proxy: ProxyConfig::default(),
            session_aliases: HashMap::new(),
            session_pins: HashMap::new(),
        }
    }
}

#[cfg(target_os = "windows")]
fn default_shell_name() -> String { "cmd".into() }

#[cfg(target_os = "macos")]
fn default_shell_name() -> String { "zsh".into() }

#[cfg(target_os = "linux")]
fn default_shell_name() -> String { "bash".into() }

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
fn default_shell_name() -> String { "sh".into() }

#[cfg(target_os = "windows")]
fn default_shells() -> Vec<ShellConfig> {
    vec![
        ShellConfig { name: "cmd".into(), command: "cmd".into(), args: None },
        ShellConfig { name: "powershell".into(), command: "powershell".into(), args: None },
        ShellConfig { name: "pwsh".into(), command: "pwsh".into(), args: None },
    ]
}

#[cfg(target_os = "macos")]
fn default_shells() -> Vec<ShellConfig> {
    vec![
        ShellConfig { name: "zsh".into(), command: "/bin/zsh".into(), args: Some(vec!["--login".into()]) },
        ShellConfig { name: "bash".into(), command: "/bin/bash".into(), args: Some(vec!["--login".into()]) },
    ]
}

#[cfg(target_os = "linux")]
fn default_shells() -> Vec<ShellConfig> {
    vec![
        ShellConfig { name: "bash".into(), command: "/bin/bash".into(), args: None },
        ShellConfig { name: "zsh".into(), command: "/usr/bin/zsh".into(), args: None },
        ShellConfig { name: "sh".into(), command: "/bin/sh".into(), args: None },
    ]
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
fn default_shells() -> Vec<ShellConfig> {
    vec![
        ShellConfig { name: "sh".into(), command: "/bin/sh".into(), args: None },
    ]
}

fn config_path(app: &AppHandle) -> PathBuf {
    let dir = app.path().app_data_dir().expect("failed to get app data dir");
    fs::create_dir_all(&dir).ok();
    dir.join("config.json")
}

fn legacy_config_paths(app: &AppHandle) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Some(parent) = app
        .path()
        .app_data_dir()
        .ok()
        .and_then(|dir| dir.parent().map(|p| p.to_path_buf()))
    {
        paths.push(parent.join("com.tauri-app.tauri-app").join("config.json"));
    }
    paths
}

pub fn load_config_from_disk(app: &AppHandle) -> AppConfig {
    let path = config_path(app);
    if let Ok(content) = fs::read_to_string(&path) {
        return migrate_config(serde_json::from_str(&content).unwrap_or_default());
    }

    for legacy_path in legacy_config_paths(app) {
        if let Ok(content) = fs::read_to_string(&legacy_path) {
            let config = migrate_config(serde_json::from_str(&content).unwrap_or_default());
            let _ = save_migrated_config(&path, &config);
            return config;
        }
    }

    migrate_config(AppConfig::default())
}

fn save_migrated_config(path: &PathBuf, config: &AppConfig) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

/// 将旧格式 `pane`（单个）迁移到新格式 `panes`（数组）
fn normalize_split_node(node: &mut SavedSplitNode) {
    match node {
        SavedSplitNode::Leaf { pane, panes } => {
            if let Some(p) = pane.take() {
                if panes.is_empty() {
                    panes.push(p);
                }
            }
        }
        SavedSplitNode::Split { children, .. } => {
            for child in children.iter_mut() {
                normalize_split_node(child);
            }
        }
    }
}

fn ensure_shell_config(config: &mut AppConfig) {
    if config.available_shells.is_empty() {
        config.available_shells = default_shells();
    }

    let missing_default = config.default_shell.trim().is_empty()
        || !config
            .available_shells
            .iter()
            .any(|shell| shell.name == config.default_shell);

    if missing_default {
        config.default_shell = config
            .available_shells
            .first()
            .map(|shell| shell.name.clone())
            .unwrap_or_else(default_shell_name);
    }
}

fn ensure_ui_style(config: &mut AppConfig) {
    match config.ui_style.as_str() {
        "classic" | "pro" | "workbench" | "product" | "mission" | "editorial" | "dopamine" => {}
        _ => config.ui_style = default_ui_style(),
    }
}

fn ensure_glass_settings(config: &mut AppConfig) {
    if !config.glass_strength.is_finite() {
        config.glass_strength = default_glass_strength();
    }
    config.glass_strength = config.glass_strength.clamp(0.0, 100.0);
}

fn migrate_config(mut config: AppConfig) -> AppConfig {
    ensure_shell_config(&mut config);
    ensure_ui_style(&mut config);
    ensure_glass_settings(&mut config);

    // 迁移 SavedSplitNode: pane → panes
    for project in config.projects.iter_mut() {
        if let Some(layout) = project.saved_layout.as_mut() {
            for tab in layout.tabs.iter_mut() {
                normalize_split_node(&mut tab.split_layout);
            }
        }
    }

    if config.project_tree.is_some() {
        config.project_groups = None;
        config.project_ordering = None;
        return config;
    }
    let groups = match config.project_groups.take() {
        Some(g) if !g.is_empty() => g,
        _ => return config,
    };
    let ordering = config.project_ordering.take().unwrap_or_default();
    let group_map: std::collections::HashMap<String, &OldProjectGroup> =
        groups.iter().map(|g| (g.id.clone(), g)).collect();

    let mut tree: Vec<ProjectTreeItem> = Vec::new();
    for item_id in &ordering {
        if let Some(old_group) = group_map.get(item_id) {
            tree.push(ProjectTreeItem::Group(ProjectGroup {
                id: old_group.id.clone(),
                name: old_group.name.clone(),
                collapsed: old_group.collapsed,
                children: old_group.project_ids.iter()
                    .map(|pid| ProjectTreeItem::ProjectId(pid.clone()))
                    .collect(),
            }));
        } else {
            tree.push(ProjectTreeItem::ProjectId(item_id.clone()));
        }
    }
    config.project_tree = Some(tree);
    config
}

#[tauri::command]
pub fn load_config(app: AppHandle) -> AppConfig {
    load_config_from_disk(&app)
}

#[tauri::command]
pub fn save_config(app: AppHandle, config: AppConfig) -> Result<(), String> {
    let path = config_path(&app);
    let normalized = migrate_config(config);
    save_migrated_config(&path, &normalized)
}

pub fn apply_window_glass_to_window(
    window: &tauri::WebviewWindow,
    enabled: bool,
    strength: f64,
) -> Result<(), String> {
    let clamped_strength = strength.clamp(0.0, 100.0);

    #[cfg(target_os = "macos")]
    {
        use tauri::window::{Effect, EffectState, EffectsBuilder};
        if enabled {
            window
                .set_effects(Some(
                    EffectsBuilder::new()
                        .effect(Effect::Sidebar)
                        .state(EffectState::Active)
                        .radius(8.0 + clamped_strength * 0.18)
                        .build(),
                ))
                .map_err(|e| e.to_string())?;
        } else {
            window
                .set_effects(None::<tauri::utils::config::WindowEffectsConfig>)
                .map_err(|e| e.to_string())?;
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = (window, enabled, clamped_strength);
    }

    Ok(())
}

#[tauri::command]
pub fn set_window_glass(
    window: tauri::WebviewWindow,
    enabled: bool,
    strength: f64,
) -> Result<(), String> {
    apply_window_glass_to_window(&window, enabled, strength)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_config_has_shells() {
        let config = AppConfig::default();
        assert!(!config.available_shells.is_empty());
        assert!(!config.default_shell.is_empty());
    }

    #[test]
    fn config_round_trip() {
        let config = AppConfig::default();
        let json = serde_json::to_string(&config).unwrap();
        let parsed: AppConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.available_shells.len(), config.available_shells.len());
    }

    #[test]
    fn old_config_without_layout_deserializes() {
        let json = r#"{
            "projects": [{"id": "1", "name": "test", "path": "/tmp"}],
            "defaultShell": "cmd",
            "availableShells": [{"name": "cmd", "command": "cmd"}],
            "uiFontSize": 13,
            "terminalFontSize": 14
        }"#;
        let config: AppConfig = serde_json::from_str(json).unwrap();
        assert_eq!(config.projects.len(), 1);
        assert!(config.projects[0].saved_layout.is_none());
        assert_eq!(config.projects[0].proxy_mode, ProjectProxyMode::Inherit);
        assert_eq!(config.ui_style, "classic");
        assert!(!config.window_glass);
        assert_eq!(config.glass_strength, 34.0);
    }

    #[test]
    fn old_config_without_groups_deserializes() {
        let json = r#"{
            "projects": [{"id": "1", "name": "test", "path": "/tmp"}],
            "defaultShell": "cmd",
            "availableShells": [{"name": "cmd", "command": "cmd"}],
            "uiFontSize": 13,
            "terminalFontSize": 14
        }"#;
        let config: AppConfig = serde_json::from_str(json).unwrap();
        assert!(config.project_tree.is_none());
        assert!(config.project_groups.is_none());
        assert!(config.project_ordering.is_none());
        assert!(!config.proxy.enabled);
        assert_eq!(config.ui_style, "classic");
        assert!(!config.window_glass);
        assert_eq!(config.glass_strength, 34.0);
    }

    #[test]
    fn layout_round_trip() {
        let layout = SavedProjectLayout {
            tabs: vec![SavedTab {
                custom_title: Some("test".into()),
                split_layout: SavedSplitNode::Split {
                    direction: "horizontal".into(),
                    children: vec![
                        SavedSplitNode::Leaf { pane: Some(SavedPane { shell_name: "cmd".into() }), panes: vec![] },
                        SavedSplitNode::Leaf { pane: Some(SavedPane { shell_name: "powershell".into() }), panes: vec![] },
                    ],
                    sizes: vec![50.0, 50.0],
                },
            }],
            active_tab_index: 0,
        };
        let json = serde_json::to_string(&layout).unwrap();
        let parsed: SavedProjectLayout = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.tabs.len(), 1);
        assert_eq!(parsed.active_tab_index, 0);
    }

    #[test]
    fn migrate_old_groups_to_tree() {
        let json = r#"{
            "projects": [
                {"id": "p1", "name": "proj1", "path": "/tmp/1"},
                {"id": "p2", "name": "proj2", "path": "/tmp/2"}
            ],
            "projectGroups": [{"id": "g1", "name": "Group1", "collapsed": false, "projectIds": ["p1"]}],
            "projectOrdering": ["g1", "p2"],
            "defaultShell": "cmd",
            "availableShells": [{"name": "cmd", "command": "cmd"}],
            "uiFontSize": 13,
            "terminalFontSize": 14
        }"#;
        let config: AppConfig = serde_json::from_str(json).unwrap();
        let config = migrate_config(config);
        assert!(config.project_tree.is_some());
        assert!(config.project_groups.is_none());
        assert!(config.project_ordering.is_none());
        let tree = config.project_tree.unwrap();
        assert_eq!(tree.len(), 2);
    }

    #[test]
    fn proxy_config_round_trip() {
        let mut config = AppConfig::default();
        config.proxy.enabled = true;
        config.proxy.all_proxy = "socks5://127.0.0.1:7897".into();
        config.projects.push(ProjectConfig {
            id: "p1".into(),
            name: "proj".into(),
            path: "/tmp/proj".into(),
            saved_layout: None,
            expanded_dirs: vec![],
            proxy_mode: ProjectProxyMode::Enabled,
            proxy_override: Some(ProxyOverrideConfig {
                all_proxy: "socks5://127.0.0.1:7898".into(),
                http_proxy: String::new(),
                https_proxy: String::new(),
            }),
        });
        config.session_aliases.insert("/tmp/proj".into(), HashMap::from([
            ("codex:abc".into(), "My Session".into()),
        ]));
        config.session_pins.insert("/tmp/proj".into(), HashMap::from([
            ("codex:abc".into(), true),
        ]));

        let json = serde_json::to_string(&config).unwrap();
        let parsed: AppConfig = serde_json::from_str(&json).unwrap();
        assert!(parsed.proxy.enabled);
        assert_eq!(parsed.projects[0].proxy_mode, ProjectProxyMode::Enabled);
        assert_eq!(parsed.session_aliases["/tmp/proj"]["codex:abc"], "My Session");
        assert!(parsed.session_pins["/tmp/proj"]["codex:abc"]);
    }

    #[test]
    fn default_config_serializes_default_ui_style() {
        let config = AppConfig::default();
        let json = serde_json::to_value(&config).unwrap();
        assert_eq!(json["uiStyle"], "pro");
        assert_eq!(json["windowGlass"], false);
        assert_eq!(json["glassStrength"], 34.0);
    }

    #[test]
    fn migrate_config_preserves_new_ui_styles() {
        let mut mission = AppConfig::default();
        mission.ui_style = "mission".into();
        let mission = migrate_config(mission);
        assert_eq!(mission.ui_style, "mission");

        let mut editorial = AppConfig::default();
        editorial.ui_style = "editorial".into();
        let editorial = migrate_config(editorial);
        assert_eq!(editorial.ui_style, "editorial");

        let mut dopamine = AppConfig::default();
        dopamine.ui_style = "dopamine".into();
        let dopamine = migrate_config(dopamine);
        assert_eq!(dopamine.ui_style, "dopamine");
    }

    #[test]
    fn migrate_config_restores_missing_shells() {
        let mut config = AppConfig::default();
        config.default_shell.clear();
        config.available_shells.clear();

        let migrated = migrate_config(config);
        assert!(!migrated.available_shells.is_empty());
        assert!(!migrated.default_shell.is_empty());
        assert!(migrated
            .available_shells
            .iter()
            .any(|shell| shell.name == migrated.default_shell));
    }

    #[test]
    fn nested_tree_round_trip() {
        let tree = vec![
            ProjectTreeItem::ProjectId("p1".into()),
            ProjectTreeItem::Group(ProjectGroup {
                id: "g1".into(),
                name: "Group1".into(),
                collapsed: false,
                children: vec![
                    ProjectTreeItem::ProjectId("p2".into()),
                    ProjectTreeItem::Group(ProjectGroup {
                        id: "g2".into(),
                        name: "Sub".into(),
                        collapsed: true,
                        children: vec![ProjectTreeItem::ProjectId("p3".into())],
                    }),
                ],
            }),
        ];
        let json = serde_json::to_string(&tree).unwrap();
        let parsed: Vec<ProjectTreeItem> = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.len(), 2);
    }
}
