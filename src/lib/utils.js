import * as query from "./query.js";


const transformCallee = (path, callee, from, to) => {
  if (callee.type === "Identifier") {
    const binding = path.scope.getBinding(callee.name);
    if (!binding && callee.name == from) {
      callee.name = to;
      return;
    }
  }

  if (callee.type === "MemberExpression") {
    if (callee.type === "MemberExpression") {
      if (callee.property.name === from) {
        callee.property.name = to
        return
      }
    }
  }

  throw new Error(`Unhandled callee transformation ${callee.type}`)
}


function isPropIdentifier(path) {
  const component = query.findComponentRoot(path);
  if (!component) return;

  const params = query.getFunctionParams(component);
  if (!params || params.length === 0) return;

  const isMember =
    path.parentPath.type === "MemberExpression" &&
    !path.parentPath.node.computed;
  const bindingName = isMember
    ? path.parentPath.node.object.name
    : path.node.name;

  const b = path.scope.getBinding(bindingName);
  if (!b) return;

  const isRef = b.referencePaths.find((rp) => rp === path);

  if (b.path.node.type === "ObjectPattern" && b.path.node === params[0]) {
    // prop is destructured within function param declaration
    if (!isRef) return;
    return true;
  } else {
    if (isMember) {
      // prop is accessed as a member of the param
      if (path.node.name === params[0].name) return;
      if (b.identifier.name !== params[0].name) return;
      return true;
    } else {
      // prop is destructured after param declaration, in the function body
      if (path.parent.type === "ObjectProperty") return;
      if (
        b.path.node.type === "VariableDeclarator" &&
        b.path.node.id.type === "ObjectPattern"
      ) {
        if (b.path.node.init.name === params[0].name) {
          return true;
        }
      }
    }
  }
}

export {
  isPropIdentifier,
  transformCallee
};
