import fs from "node:fs";
import path from "node:path";

const src = path.resolve("node_modules/jieba-wasm/pkg/web/jieba_rs_wasm_bg.wasm");
const dstDir = path.resolve("public/wasm");
const dst = path.join(dstDir, "jieba_rs_wasm_bg.wasm");

fs.mkdirSync(dstDir, {recursive: true});
fs.copyFileSync(src, dst);

console.log("[copy-wasm] OK:", dst);
