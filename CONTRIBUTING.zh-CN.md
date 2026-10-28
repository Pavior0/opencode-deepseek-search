# 贡献指南

[English](CONTRIBUTING.md) · [简体中文](CONTRIBUTING.zh-CN.md)

感谢你改进 `opencode-deepseek-search`。

## 开始之前

- 阅读仓库根目录的 `AGENTS.md`；
- 修改 OpenCode plugin API 前，阅读 OpenCode V2 plugin 文档和 OpenCode 对应实现；
- 不要把 API key、server password、带签名 URL 或私有页面内容写入 commit、测试、日志或 issue；
- 优先使用不访问网络的测试。CI 不执行付费 DeepSeek API 请求。

## 本地开发

```sh
bun install
bun run format
bun run test
bun run check
```

常用命令：

```sh
bun run format        # 使用 Bun 重写支持的文件
bun run format:check  # 检查格式
bun run test          # 不访问网络的测试
bun run typecheck     # 只执行 TypeScript 检查
bun run build         # 构建 GUI bundle
bun run check         # 格式、类型和构建检查
```

## 架构约定

让修改留在拥有对应 contract 的层：

- `src/rpc.ts`：跨进程 RPC 的公共 schema 和类型；
- `src/server/http.ts`：共享的 DeepSeek HTTP transport、重试和响应上限；
- `src/server/search.ts` 和 `src/server/fetch.ts`：各 endpoint 的 schema 与归一化；
- `src/server/plugin.ts`：OpenCode 注册、权限、credential，以及 tool/provider/RPC 映射；
- `src/server/format.ts`：面向模型的文本渲染和总输出预算；
- `src/gui/`：Desktop 展示层，通过当前 session server 调用 RPC。

不要在调用方重复定义公共 schema 或 domain interface。DeepSeek 的 snake_case wire schema 与 OpenCode 的 camelCase contract 属于不同外部边界，应保持分离。

## GUI plugin 约定

- GUI 功能开关必须放在持久化的 `Store.global` state 中。Settings 始终可用，其他入口 UI 必须受对应开关控制。
- 优先使用 `ctx.ui` primitive 和 OpenCode theme token，再增加自定义控件或视觉 contract。
- 打开面板或恢复缓存结果不得触发付费 DeepSeek 请求；只有用户明确执行搜索时才能调用 Search。
- 明确区分 server 数据、session 内结果缓存和持久化搜索历史；三者不是同一个状态边界。

## Tool 和权限改动

新增或修改 tool 时：

1. 在 tool 边界定义 input/output schema；
2. 说明它是否支持 Code Mode；
3. 传递 session signal，或使用 Effect interruption 支持取消；
4. 在远程副作用发生前执行 permission assertion；
5. 限制模型可见的输出大小；
6. 为校验、格式化或重试行为增加不访问网络的测试。

保持 OpenCode 内置 `webfetch` contract 不变。本插件增加 DeepSeek Fetch，不应静默替换 OpenCode 原生抓取行为。

## 测试

测试不得依赖 API key 或网络。使用 fake HTTP response 和确定性的 `Retry-After`。测试可观察行为，例如：

- credential 优先级；
- URL 和 option 校验；
- 重试和取消；
- response 与输出大小限制；
- 上游 malformed response；
- tool 格式化和不可信内容标记。

不要断言实现字符串，也不要为了证明测试文件存在而写测试。

## Pull Request

保持 PR 聚焦，并说明：

- 用户可见行为；
- 受影响的边界或 contract；
- 测试，或为什么不适合增加测试；
- 新 option、权限或计费行为对应的文档更新；
- 实际执行过的验证命令。

避免无关的格式化改动。只有在格式配置或目标改动需要时才运行 `bun run format`。

## 文档

公共行为变化时，同时更新 `README.md` 和 `README.zh-CN.md`。开发流程或仓库策略变化时，同时更新两个贡献指南。

## 安全

不要在公开 issue 中披露 secret。发现潜在漏洞时，请先通过私下渠道提供最小化、已脱敏的复现，不要在公开 issue 中提交 credential 或页面数据。
