# macOS Release Notes

`TermNest` 可以本地构建 `.app` 和 `.dmg`，但如果要对外分发，需要正式签名和 notarization。

## 本地构建

```bash
cd /path/to/termnest
npm install
npm run tauri build
```

构建产物通常在：

- `src-tauri/target/release/bundle/macos/TermNest.app`
- `src-tauri/target/release/bundle/dmg/TermNest_<version>_aarch64.dmg`

## 本地安装

```bash
rm -rf /Applications/TermNest.app
ditto src-tauri/target/release/bundle/macos/TermNest.app /Applications/TermNest.app
codesign --force --deep --sign 'Apple Development: 8617315609907 (K6T79U8T3U)' \
  --entitlements src-tauri/entitlements.plist \
  /Applications/TermNest.app
open /Applications/TermNest.app
```

> **注意：** `--entitlements` 参数必须带上，否则每次打开都会弹 macOS 文件访问授权弹窗。`entitlements.plist` 关闭了沙盒并授予文件访问权限。

## 对外发布需要什么

如果要给其他用户稳定安装和打开，至少需要：

1. `Developer ID Application` 证书
2. Apple notarization

你可以先检查当前机器上有哪些签名身份：

```bash
security find-identity -v -p codesigning
```

理想情况下应看到：

- `Developer ID Application: <Team Name> (<Team ID>)`

如果只有开发证书，那适合本机调试，不适合作为正式发布包对外分发。

## 建议发布流程

1. 构建 `TermNest.app`
2. 使用 `Developer ID Application` 证书对应用签名（带 `--entitlements`）
3. 打包 `.dmg`
4. 提交 notarization
5. notarization 通过后 stapler 回写票据
6. 再发布 `.dmg`

## 当前仓库信息

- App 名：`TermNest`
- bundle id：`ai.flowx.termnest`
- entitlements：`src-tauri/entitlements.plist`
