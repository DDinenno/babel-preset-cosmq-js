const { findNearestAncestor } = require("./utils");

function matchParentRecursively(path, matcher) {
  if (!path) return false;
  if (matcher(path)) return true;
  return matchParentRecursively(path.parentPath, matcher);
}

function isInTemplateLiteral(path) {
  return matchParentRecursively(path, (p) => p.node.type === "TemplateLiteral");
}

function isCalleeModuleMethod(node, property) {
  if (!node) return;
  if (node.type === "MemberExpression") {
    if (node.object.name === "PlaceholderJs") {
      return node.property.name === property;
    }
  }
  if (node.type === "CallExpression")
    return isCalleeModuleMethod(node.callee, property);
  return false;
}

function isModuleMethod(path, node, name) {
  if (node.type === "CallExpression") {
    const callee = node.callee;

    if (callee.type === "Identifier") {
      const binding = path.scope.getBinding(callee.name);
      if (!binding && callee.name === name) return true;

      if (binding && binding.kind === "module") {
        // checks to see if matches with a named import, regardless of it being mapped to a new identifier
        return (
          binding.path.type === "ImportSpecifier" &&
          binding.path.parentPath.node.source.value === "reactive-frame" &&
          binding.path.node.imported.name === name &&
          binding.path.node.local.name === callee.name
        );
      }
    }

    if (callee.type === "MemberExpression") {
      if (callee.type === "MemberExpression") {
        if (callee.object.name === "PlaceholderJs") {
          return callee.property.name === name;
        }
      }
    }
  }

  return false;
}

function isIdentifierInDeps(path) {
  return matchParentRecursively(path, (p) => {
    if (p.type === "ArrayExpression") {
      if (isModuleMethod(p.parentPath, p.parentPath.node, "conditional")) {
        if (p.parentPath.node.arguments[0] === p.node) return true;
        return false;
      }

      return (
        isModuleMethod(p.parentPath, p.parentPath.node, "compute") ||
        isModuleMethod(p.parentPath, p.parentPath.node, "effect")
      );
    }
  });
}

function isWrappedInPropertyValueGetter(path) {
  return matchParentRecursively(path, (parentPath) =>
    isCalleeModuleMethod(parentPath.node, "getPropValue")
  );
}

function isInComputedDeps(path) {
  if (path.parent == null) return false;
  if (path.type === "ArrayExpression") {
    if (
      isCalleeModuleMethod(path.parent.callee, "compute") ||
      isCalleeModuleMethod(path.parent.callee, "conditional")
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
  return matchParentRecursively(path, (p) =>
    isModuleMethod(p, p.node, "compute")
  );
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
      isCalleeModuleMethod(p.node.callee, "conditional") &&
      isInConditionalCondition(path)
  );
}

function isInComponentProps(path) {
  return matchParentRecursively(path, (parentPath) => {
    return isCalleeModuleMethod(parentPath.node.callee, "registerComponent");
  });
}

function isFunction(path) {
  return (
    path.node.type === "FunctionDeclaration" ||
    (path.node.type === "VariableDeclaration" &&
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
    path.node.declarations[0] &&
    path.node.declarations[0].init &&
    path.node.declarations[0].init.type === "ArrowFunctionExpression"
  ) {
    return isComponentIdentifier(path.node.declarations[0].id);
  }

  return false;
}

/** is in a function inside of a component */
function isInnerFunction(path) {
  const nearestFunction = findNearestAncestor(path, isFunction);
  if (!nearestFunction) return false;
  return !isComponentFunction(nearestFunction);
}

function isInComponentBody(path) {
  return matchParentRecursively(path, (p) => {
    // TODO: refactor for normal function style
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
  if (["JSXExpressionContainer", "JSXAttribute"].includes(path.parent.type)) {
    return true;
  }
  false;
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

module.exports = {
  isWrappedInConditionalStatement,
  isWrappedInComputedFunc,
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
  isComponentIdentifier,
  isInBlockStatement,
  isWrappedInSetter,
  isModuleMethod,
  isIdentifierInDeps,
  isInnerFunction,
  isIdentifierInJSXAttribute,
  isObservableAccessed,
  isObservableAssignment,
};
