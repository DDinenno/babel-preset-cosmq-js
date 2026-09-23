
import { TRANSFORMER_STEPS } from "../lib/constants.js";
import transformReactiveList from "../lib/transformers/transformReactiveList.js"
import transformComputed from "../lib/transformers/transformComputed.js";
import transformContext from "../lib/transformers/transformContext.js";
import transformObservables from "../lib/transformers/transformObservables.js";
import transformJSXElements from "../lib/transformers/transformJSXElements.js";
import transformConditionals from "../lib/transformers/transformConditionals.js";

const stages = {
  preJSX: {},
  JSX: {},
  postJSX: {}
}

const registerTransformer = (plugin) => {
  Object.keys(TRANSFORMER_STEPS).forEach((stage) => {

    const visitors = plugin[stage] || {}
    if (!stages[stage]) stages[stage] = {}

    Object.entries(visitors).forEach(([visitorType, fn]) => {
      if (typeof fn !== "function") {
        throw new Error(`Invalid transformer: ${plugin.name} ${stage} ${visitorType}`)
      }

      if (!stages?.[stage]?.[visitorType]) stages[stage][visitorType] = []
      stages[stage][visitorType].push(fn)
    })
  })
}

registerTransformer(transformReactiveList)
registerTransformer(transformObservables)
registerTransformer(transformContext)
registerTransformer(transformComputed)
registerTransformer(transformConditionals)
registerTransformer(transformJSXElements)

export default function (babel) {
  const { types: t } = babel;

  const runStage = (stage, path) => {
    const transformedVisitors = {}

    Object.keys(stage).forEach((visitorType) => {
      transformedVisitors[visitorType] = (path) => {
        stage[visitorType].forEach((fn) => fn(t, path))
      }
    })

    path.traverse(transformedVisitors)
  }

  return {
    name: "transform-cosmq-js",
    manipulateOptions: function manipulateOptions(opts, parserOpts) {
      parserOpts.plugins.push("jsx");
    },
    visitor: {
      Program: path => {
        Object.entries(stages).forEach(([stageName, stage]) => {
          runStage(stage, path)
        })
      }
    },
  };
};
