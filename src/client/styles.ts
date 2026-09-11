/**
 * 浏览器标签页的样式表。
 *
 * 配色不写死任何颜色：全部使用 DSH 的设计令牌（`--dsw-alias-*`、
 * `--dsw-static-neutral-bluish-*`），它们由主题包按当前亮/暗模式定义。于是视图
 * 在默认的亮色主题下就是 DSH 的蓝白配色（白底、蓝灰描边、`--dsw-static-blue-*`
 * 作为强调色），切到暗色主题时也跟着走，不需要两份样式。
 *
 * 每个令牌都带兜底值，因为第三方插件不保证主题包的版本 —— 令牌缺失时仍然得到
 * 一套可读的蓝白配色，而不是透明或黑块。
 *
 * 样式以一段内联 CSS 注入。`<style>` 上的 `data-plugin` 必须是本包的准确名字：
 * 客户端 HMR 驱动就是按这个键清理过期标签页的。
 *
 * @module dsh-browser-plugin/src/client/styles
 */

/** 本包名，作为 `<style>` 标签的归属标记（HMR 清理用）。 */
const PLUGIN_TAG = 'dsh-browser-plugin'

const CSS = `
.dsh-browser-root{
  display:flex;flex-direction:column;height:100%;min-height:0;flex:1 1 auto;
  background:var(--dsw-alias-bg-layer-1,#fff);
  color:var(--dsw-alias-label-primary,#0f1115);
  font-size:var(--dsh-content-font-size-secondary,13px);
}
.dsh-browser-tabs{
  display:flex;align-items:center;gap:4px;padding:6px 8px;
  border-bottom:.5px solid var(--dsw-alias-border-l2,#0000001a);
  overflow-x:auto;flex:0 0 auto;
}
.dsh-browser-tab{
  display:flex;align-items:center;gap:4px;flex:0 0 auto;max-width:180px;
  padding:3px 4px 3px 9px;border-radius:6px;cursor:pointer;user-select:none;
  color:var(--dsw-alias-label-secondary,#61666b);
  background:transparent;border:.5px solid transparent;
}
.dsh-browser-tab:hover{background:var(--dsw-alias-interactive-bg-hover,#2631480f)}
.dsh-browser-tab[data-active="true"]{
  color:var(--dsw-alias-label-primary,#0f1115);
  background:var(--dsw-static-blue-50,#eff6ff);
  border-color:var(--dsw-static-blue-100,#dbeafe);
}
.dsh-browser-tabLabel{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-browser-tabClose{
  appearance:none;border:0;background:transparent;cursor:pointer;padding:0 2px;
  color:inherit;opacity:.55;font-size:12px;line-height:1;border-radius:4px;
}
.dsh-browser-tabClose:hover{opacity:1;background:var(--dsw-alias-interactive-bg-hover,#2631480f)}

.dsh-browser-bar{
  display:flex;align-items:center;gap:4px;padding:6px 8px;flex:0 0 auto;
  border-bottom:.5px solid var(--dsw-alias-border-l2,#0000001a);
}
.dsh-browser-btn{
  appearance:none;flex:0 0 auto;cursor:pointer;line-height:1;
  padding:5px 8px;border-radius:6px;font:inherit;
  color:var(--dsw-alias-label-secondary,#61666b);
  background:var(--dsw-alias-bg-layer-2,#fff);
  border:.5px solid var(--dsw-alias-border-l3,#0000001f);
}
.dsh-browser-btn:hover:not(:disabled){
  background:var(--dsw-alias-interactive-bg-hover,#2631480f);
  border-color:var(--dsw-alias-border-l4,#00000029);
}
.dsh-browser-btn:disabled{opacity:.5;cursor:not-allowed}
/* 图标按钮里的 SVG 按块级排，免得行内基线留出一截空隙把按钮撑高。 */
.dsh-browser-btn>svg{display:block}
.dsh-browser-btn[data-variant="primary"]{
  background:var(--dsw-static-blue-600,#2563eb);border-color:transparent;
  color:var(--dsw-alias-label-primary-foreground,#fff);font-weight:500;
}
.dsh-browser-btn[data-variant="primary"]:hover:not(:disabled){
  background:var(--dsw-static-blue-500,#3b82f6);
}
.dsh-browser-addr{
  flex:1 1 auto;min-width:0;font:inherit;padding:5px 8px;border-radius:6px;
  color:var(--dsw-alias-label-primary,#0f1115);
  background:var(--dsw-alias-bg-base,#fff);
  border:.5px solid var(--dsw-alias-border-l3,#0000001f);
  outline:none;
}
.dsh-browser-addr:focus{
  border-color:var(--dsw-static-blue-400,#60a5fa);
  box-shadow:0 0 0 2px var(--dsw-static-blue-75,#e5f0ff);
}
.dsh-browser-addr::placeholder{color:var(--dsw-alias-label-caption,#adb2b8)}

.dsh-browser-status{
  display:flex;align-items:center;gap:5px;padding:4px 10px;flex:0 0 auto;
  color:var(--dsw-alias-label-tertiary,#81858c);
  font-size:var(--dsw-font-xxs-12-font-size,12px);
  border-bottom:.5px solid var(--dsw-alias-border-l1,#0000000a);
}
.dsh-browser-dot{
  width:7px;height:7px;border-radius:50%;flex:0 0 auto;
  background:var(--dsw-alias-label-caption,#adb2b8);
}
.dsh-browser-dot[data-live="true"]{background:var(--dsw-alias-state-success-primary,#22c55e)}
.dsh-browser-statusText{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-browser-url{
  margin-left:auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  max-width:60%;direction:rtl;text-align:left;
  color:var(--dsw-alias-label-caption,#adb2b8);
}
/* 「另一个对话正在用浏览器」的提示：共用资源的状态必须可见，否则像点了没反应。 */
.dsh-browser-driver{
  flex:0 0 auto;padding:0 6px;border-radius:10px;
  color:var(--dsw-alias-state-warn-label,#dd8629);
  border:.5px solid var(--dsw-alias-state-warn-secondary,#f7ad31);
  background:var(--dsw-alias-state-warn-tertiary,#fef5e7);
}

/*
 * 实时视图容器。画面与面板同形（宿主把浏览器视口设成这个容器的尺寸），所以这里不
 * 需要滚动条；overflow:hidden 顺带挡住 1px 级的取整误差。
 */
.dsh-browser-view{
  flex:1 1 auto;min-height:0;min-width:0;position:relative;overflow:hidden;
  background:var(--dsw-alias-bg-module-platform,#f5f6f7);
}
/*
 * 画面铺满容器：高度铺满而不是按宽度算 —— 后者在窄栏里会把画面顶到上方、下面留一
 * 大块空白。两个边长都约束住，任何一端先到即停，剩下的极小误差交给 object-fit，
 * 因此永远不会裁掉页面内容。
 */
.dsh-browser-frame{
  display:block;width:100%;height:100%;outline:none;object-fit:contain;
  cursor:crosshair;background:#fff;
}
.dsh-browser-note{
  padding:20px 16px;color:var(--dsw-alias-label-tertiary,#81858c);
  line-height:1.7;text-align:center;
}
.dsh-browser-note[data-tone="error"]{
  color:var(--dsw-alias-state-error-primary,#ec1313);
}
.dsh-browser-modes{
  display:flex;align-items:center;gap:6px;padding:6px 8px;flex:0 0 auto;
  border-top:.5px solid var(--dsw-alias-border-l2,#0000001a);
  color:var(--dsw-alias-label-tertiary,#81858c);
  font-size:var(--dsw-font-xxs-12-font-size,12px);
}
.dsh-browser-seg{
  display:inline-flex;overflow:hidden;border-radius:6px;
  border:.5px solid var(--dsw-alias-border-l3,#0000001f);
}
.dsh-browser-segBtn{
  appearance:none;border:0;cursor:pointer;font:inherit;
  padding:4px 9px;line-height:1.3;
  color:var(--dsw-alias-label-secondary,#61666b);
  background:var(--dsw-alias-bg-layer-2,#fff);
}
.dsh-browser-segBtn:hover:not([data-active="true"]){
  background:var(--dsw-alias-interactive-bg-hover,#2631480f);
}
.dsh-browser-segBtn[data-active="true"]{
  background:var(--dsw-static-blue-600,#2563eb);
  color:var(--dsw-alias-label-primary-foreground,#fff);
}
`

/** 注入样式表（幂等）。 */
export function ensureStyles(): void {
  if (document.head.querySelector(`style[data-plugin="${PLUGIN_TAG}"]`)) return
  const tag = document.createElement('style')
  tag.dataset.plugin = PLUGIN_TAG
  tag.textContent = CSS
  document.head.appendChild(tag)
}
