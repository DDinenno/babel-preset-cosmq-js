import transformJsx from "./transform-jsx/index.js";
import transformJsxConditional from "./transform-jsx-conditional/index.js";
import transformReactiveList from "./transform-reactive-list/index.js";
import transform from "./transform/index.js";

export default function () {
  return {
    plugins: [
      // transformJsxConditional,
      // transformReactiveList,
      transform,
      // transformJsx,
    ],
  };
}
