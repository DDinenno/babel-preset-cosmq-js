import transform from "./transform/index.js";

export default function () {
  return {
    plugins: [
      transform,
    ],
  };
}
