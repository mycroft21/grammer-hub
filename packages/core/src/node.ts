/**
 * Node 전용 진입점. 브라우저 번들에 들어가면 안 되는 것(child_process 등)만 여기서 내보낸다.
 * 클라이언트 컴포넌트는 "@grammer-hub/core"만 import한다.
 */
export * from "./providers/claude-cli";
