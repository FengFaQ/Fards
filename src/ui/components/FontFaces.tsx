/**
 * 本地字体注入（@font-face）
 * ------------------------------------------------------------------
 * 字体放在 public/fonts/，需要 BASE_URL 前缀才能在 GitHub Pages 子路径下正确加载；
 * CSS 里的绝对路径不会被 Vite 重写，因此这里用 import.meta.env.BASE_URL 动态注入。
 * 文件名由 data-forge 下载提供，缺失时浏览器自动回退到系统字体（不阻塞渲染）。
 */
const BASE = import.meta.env.BASE_URL || '/';

const FONT_CSS = `
/* Black Ops One —— 军事 stencil 标题字体 */
@font-face {
  font-family: "Black Ops One";
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url("${BASE}fonts/BlackOpsOne-Regular.woff2") format("woff2");
}

/* Oswald —— 正文/数字窄体 */
@font-face {
  font-family: "Oswald";
  font-style: normal;
  font-weight: 200 700;
  font-display: swap;
  src: url("${BASE}fonts/Oswald-VariableFont_wght.woff2") format("woff2-variations");
}
`;

export function FontFaces() {
  return <style dangerouslySetInnerHTML={{ __html: FONT_CSS }} />;
}

export default FontFaces;
