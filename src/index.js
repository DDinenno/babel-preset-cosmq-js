import transformJsx from "./transform-jsx/index.js";
import transformJsxConditional from "./transform-jsx-conditional/index.js";

export default function () {
  return {
    plugins: [
      transformJsxConditional,
      transformJsx,
    ],
  };
}
