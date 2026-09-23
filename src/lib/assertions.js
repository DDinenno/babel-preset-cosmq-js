import { CONDITIONAL_EXPRESSIONS } from "./constants.js";
import * as query from "./query.js";

function matchParentRecursively(path, matcher) {
  if (!path || !path.parentPath) return false;
  if (matcher(path.parentPath)) return true;
  return matchParentRecursively(path.parentPath, matcher);
}

function isInTemplateLiteral(path) {
  return matchParentRecursively(path, (p) => p.node.type === "TemplateLiteral");
}

function isCalleeModuleMethod(node, property) {
  if (!node) return;
  if (node.type === "MemberExpression") {
    if (node.object.name === "Cosmq") {
      return node.property.name === property;
    }
  }
  if (node.type === "CallExpression")
    return isCalleeModuleMethod(node.callee, property);
  return false;
}

function isComputeModuleMethod(path, _node = null) {
  return isModuleMethod(path, "compute", _node) || isModuleMethod(path, "$", _node)
}

function isComputeAliasModuleMethod(path, _node = null) {
  return isModuleMethod(path, "$", _node)
}

function isCallMemberExpExpression(path, member) {
  if (!path) return
  return (path.type === "CallExpression" &&
    path.node.callee.type === "MemberExpression" &&
    path.node.callee.property.name === member)
}

function parentsMatchingTypes(path, arr) {
  let compare = []

  path.findParent((p) => {
    compare.push(p.type)
  });

  compare = compare.slice(0, arr.length)

  return compare.length === arr.length && compare.every((p, i) => p === arr[i])
}

function isMapInJSXExpression(path) {
  if (path.type === "Identifier") {
    if (parentsMatchingTypes(path, ["MemberExpression", "CallExpression", "JSXExpressionContainer"])) {
      return true;
    }
  }
}

function isModuleMethod(path, methodName, _node = null) {
  if (!path || !path.node) return;

  const names = [];
  if (methodName === "compute") {
    // also asserts for compute alias
    names.push("compute", "$");
  } else {
    names.push(methodName);
  }

  const node = _node || path.node;
  if (!node) throw new Error("Node isn't found!");

  if (node.type === "CallExpression") {
    const callee = node.callee;

    if (callee.type === "Identifier") {
      const binding = path.scope.getBinding(callee.name);
      if (!binding && names.includes(callee.name)) return true;

      if (binding && binding.kind === "module") {
        // checks to see if matches with a named import, regardless of it being mapped to a new identifier
        return (
          binding.path.type === "ImportSpecifier" &&
          binding.path.parentPath.node.source.value === "cosmq-js" &&
          names.includes(binding.path.node.imported.name) &&
          binding.path.node.local.name === callee.name
        );
      }
    }

    if (callee.type === "MemberExpression") {
      if (callee.type === "MemberExpression") {
        if (callee.object.name === "Cosmq") {
          return names.includes(callee.property.name);
        }
      }
    }
  }

  return false;
}

function isIdentifierInDeps(path) {
  return matchParentRecursively(path, (p) => {
    if (p.type === "ArrayExpression") {

      if (isModuleMethod(p.parentPath, "conditional")) {
        if (p.parentPath.node.arguments[0] === p.node) return true;
        return false;
      }

      return (
        isModuleMethod(p.parentPath, "compute") ||
        isModuleMethod(p.parentPath, "effect")
      );
    }
  });
}

function isWrappedInPropertyValueGetter(path) {
  return matchParentRecursively(path, (parentPath) =>
    isModuleMethod(parentPath, "getPropValue")
  );
}

function isInComputedDeps(path) {
  if (path.parent == null) return false;
  if (path.type === "ArrayExpression") {
    if (
      isModuleMethod(path.parentPath, "compute") ||
      isModuleMethod(path.parentPath, "conditional")
    )
      return true;
  }
  if (path.parentPath) return isInComputedDeps(path.parentPath);
}

function bodyContainsContext(path) {
  return path.parent.body.find((node) => {
    if (node.type === "VariableDeclaration") {
      return node.declarations.find(
        (dec) =>
          dec.type === "VariableDeclarator" &&
          dec.id.name === "_component_context"
      );
    }
  });
}

function isWrappedInComputedFunc(path) {
  return matchParentRecursively(path, (p) => isComputeModuleMethod(p));
}

function isWrappedInEffectFunc(path) {
  return matchParentRecursively(path, (p) => isModuleMethod(p, "effect"));
}

function isWrappedInObserveFunc(path) {
  return matchParentRecursively(path, (p) => isModuleMethod(p, "observe"));
}

function isInConditionalCondition(path) {
  return matchParentRecursively(
    path,
    (p) => p.type === "ObjectProperty" && p.node.key.value === "__condition__"
  );
}

function isWrappedInConditionalStatement(path) {
  return matchParentRecursively(
    path,
    (p) =>
      isModuleMethod(p, "conditional") &&
      isInConditionalCondition(path)
  );
}

function isInComponentProps(path) {
  return matchParentRecursively(path, (parentPath) => {
    return isModuleMethod(parentPath, "registerComponent");
  });
}

function isInElement(path) {
  return matchParentRecursively(path, (parentPath) => {
    return isModuleMethod(parentPath, "registerElement");
  });
}

function isFunction(path) {
  return (

    path.node && path.node.type === "FunctionDeclaration" ||
    (path.node && path.node.type === "VariableDeclaration" &&
      path.node.declarations[0] &&
      path.node.declarations[0].init &&
      path.node.declarations[0].init.type === "ArrowFunctionExpression")
  );
}

function isComponentIdentifier(node) {
  return /^Component_/.test(node.name);
}

function isComponentFunction(path) {
  if (path.node.type === "FunctionDeclaration") {
    return isComponentIdentifier(path.node.id);
  } else if (
    path.node.type === "VariableDeclaration" &&
    path.node?.declarations?.[0]?.init?.type === "ArrowFunctionExpression"
  ) {
    return isComponentIdentifier(path.node?.declarations?.[0]?.id);
  }

  return false;
}

/** is in a function inside of a component */
function isInnerFunction(path) {
  const nearestFunction = path.find(isFunction);
  if (!nearestFunction) return false;
  return !isComponentFunction(nearestFunction);
}

function isInComponentBody(path) {
  return matchParentRecursively(path, (p) => {
    if (p.node.type !== "VariableDeclarator") return;
    if (p.node.init.type !== "ArrowFunctionExpression") return;

    const binding = p.scope.bindings[p.node.id.name];
    if (!binding) return;

    return binding.referencePaths.some(isInComponentProps);
  });
}

function isInBlockStatement(path) {
  return matchParentRecursively(
    path,
    (parentPath) => parentPath.type === "BlockStatement"
  );
}

function isWrappedInSetter(path) {
  return matchParentRecursively(
    path,
    (p) =>
      p.node.type === "CallExpression" &&
      p.node.callee.type === "MemberExpression" &&
      p.node.callee.property.name === "set"
  );
}

function isIdentifierInJSXAttribute(path) {
  if (["JSXAttribute"].includes(path.parent.type)) {
    return true;
  }
  false;
}

function isJSXChildElement(path) {
  if (!path) return false;

  if (path.parentPath?.isJSXElement()) {
    return true;
  }
  if (path.parentPath?.isJSXExpressionContainer() && path.parentPath?.parentPath?.isJSXElement()) {
    return true;
  }

  return false;
}

function isObservableAccessed(path) {
  if (path.parent.type === "MemberExpression") {
    if (path.parent.property.name === "value") return true;
  }
  return false;
}

function isObservableAssignment(path) {
  if (path.parent.type === "MemberExpression") {
    if (path.parent.property.name === "set") return true;
  }
  return false;
}

function isRootMemberExpReference(path) {
  if (!path?.isMemberExpression?.()) return false
  const parent = path.parent

  return !parent || parent?.type !== "MemberExpression"
}

function isEntityShorthand(path, name) {
  if (
    path.node.type === "VariableDeclarator" &&
    path.node.init.type === "CallExpression" &&
    path.node.init.callee.name === name
  )
    return true;
}

function isInReactiveList(path) {
  return matchParentRecursively(path, (p) =>
    isModuleMethod(p, "reactiveList")
  );
}

function isReactiveListData(path) {
  return (
    isModuleMethod(path.parentPath, "reactiveList") &&
    Array.isArray(path.container) &&
    path.container[0] === path.node
  );
}

function isImportIdentifier(path) {
  if (
    path.parent &&
    (path.parent.type === "ImportSpecifier" ||
      path.parent.type === "ImportDefaultSpecifier")
  )
    return false;
  const binding = query.getRootBoundNode(path, path.node.name);
  if (binding && binding.kind === "module") {
    if (
      binding.path &&
      binding.path.parentPath &&
      binding.path.parentPath.node &&
      binding.path.parentPath.node.source &&
      binding.path.parentPath.node.source.value === "cosmq-js"
    )
      return false;
    return true;
  }
  return false;
}

function isConditionExpression(node) {
  if (!node.expression) return false;

  const isIdentifier = node.expression.type === "Identifier";
  const isCallExp = node.expression.type === "CallExpression";

  if (isIdentifier || isCallExp) {
    if (!node.expression.callee || !node.expression.callee.callee) return;

    const name = node.expression.callee.callee.name;
    return CONDITIONAL_EXPRESSIONS.includes(name);
  }
}

function isArrowFunctionParameter(path) {
  const parent = path.parentPath.node;
  if (parent.type === "ArrowFunctionExpression") {
    return parent.params.includes(path.node);
  }
}


export {
  isImportIdentifier,
  isWrappedInConditionalStatement,
  isInConditionalCondition,
  isWrappedInComputedFunc,
  isWrappedInEffectFunc,
  isWrappedInPropertyValueGetter,
  bodyContainsContext,
  isInComputedDeps,
  isCalleeModuleMethod,
  isInTemplateLiteral,
  matchParentRecursively,
  isInComponentProps,
  isInComponentBody,
  isFunction,
  isComponentFunction,
  isInElement,
  isComponentIdentifier,
  isInBlockStatement,
  isWrappedInSetter,
  isWrappedInObserveFunc,
  isModuleMethod,
  isComputeModuleMethod,
  isComputeAliasModuleMethod,
  isIdentifierInDeps,
  isInnerFunction,
  isIdentifierInJSXAttribute,
  isObservableAccessed,
  isObservableAssignment,
  isInReactiveList,
  isEntityShorthand,
  isReactiveListData,
  isRootMemberExpReference,
  isCallMemberExpExpression,
  isMapInJSXExpression,
  isJSXChildElement,
  isConditionExpression,
  isArrowFunctionParameter
};
