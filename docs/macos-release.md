# macOS Release Notes

`TermNest` 目前可以本地构建并用 `Apple Development` 证书签名，适合开发机自用。

如果要对外分发，必须补齐下面两项：

1. `Developer ID Application` 证书
2. Apple notarization

## 开发机本地构建

```bash
cd /Users/yskj/mini-term
source ~/.cargo/env
npm install
npm run tauri build
```

构建产物：

- `src-tauri/target/release/bundle/macos/TermNest.app`
- `src-tauri/target/release/bundle/dmg/TermNest_<version>_aarch64.dmg`

## 本地安装并重签名

```bash
rm -rf '/Applications/TermNest.app'
ditto '/Users/yskj/mini-term/src-tauri/target/release/bundle/macos/TermNest.app' '/Applications/TermNest.app'
codesign --force --deep --sign 'Apple Development: 8617315609907 (K6T79U8T3U)' '/Applications/TermNest.app'
open '/Applications/TermNest.app'
```

这只能稳定本机身份，不能替代正式发布签名。

## 正式发布所需证书检查

```bash
security find-identity -v -p codesigning
```

理想情况下至少要看到：

- `Developer ID Application: <Team Name> (<Team ID>)`

如果只有 `Apple Development`，就还不能做正式对外分发。

## 正式发布建议流程

1. 用 `Developer ID Application` 对 `.app` 签名
2. 打包 `.dmg`
3. 对产物提交 notarization
4. notarization 通过后 stapler 回写票据
5. 再发布 `.dmg`

## 当前状态

- 本仓库已经改为 `TermNest`
- 本地 app 标识是 `ai.flowx.termnest`
- 当前机器可用于开发签名
- 当前机器还不具备完整的正式分发条件
