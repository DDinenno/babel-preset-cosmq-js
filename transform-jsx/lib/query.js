const { CONTEXT_PREFIX } = require("../constants");
const assert = require("./assertions");





function getJSXProperties(t, path, component = false) {
  const attrsObject = t.objectExpression([]);
  const attributes = path.node.openingElement.attributes;
  const properties = [];

  function _mapPropertyValue(node) {
    if (node == null) {
      return t.booleanLiteral(true);
    } else if (node.type === "JSXExpressionContainer") return node.expression;
    else if (node.type === "JSXExpressionContainer") return node.expression;
    return node;
  }

  attributes.forEach((attr) => {
    let property;
    const value = _mapPropertyValue(attr.value);

    if (attr.name.type === "JSXNamespacedName")
      property = t.stringLiteral(
        attr.name.namespace.name + ":" + attr.name.name.name,
      );
    else property = t.stringLiteral(attr.name.name);

    properties.push(t.objectProperty(property, value));
  });

  if (component) {
    properties.push(
      t.objectProperty(
        t.stringLiteral("children"),
        t.arrayExpression(
          path.node.children.map((child) => _mapPropertyValue(child)),
        ),
      ),
    );
  }

  attrsObject.properties = attrsObject.properties.concat(properties);

  return attrsObject;
}


// function getRootBoundNode(path, name) {
//   let binding = path.scope.getBinding(name);
//   if (!binding) return;


//   if (!binding || !binding.path || !binding.path.node || !binding.path.node.init) {
//     return;
//   }
//   let init = binding.path.node.init;
//   if (!init) return

//   if (init && init.type === "Identifier")
//     return getRootBoundNode(path, init.name);
//   if (init && init.type === "MemberExpression") {
//     if (init.object.type === "Identifier")
//       return getRootBoundNode(path, init.object.name);
//     else return
//   }
//   return binding;
// }

function getRootBoundNode(path, name) {
  let binding = path.scope.getBinding(name);

  if (!binding || !binding.path || !binding.path.node || !binding.path.node.init) {
    return;
  }

  let init = binding.path.node.init;

  if (init.type === "Identifier") {
    return getRootBoundNode(binding.path, init.name);
  }

  if (init.type === "MemberExpression") {
    if (init.object.type === "Identifier") {
      return getRootBoundNode(binding.path, init.object.name);
    }
    return binding;
  }

  return binding;
}

const getContextVariableBinding = (path, name) => {
  const binding = getRootBoundNode(path.parentPath, name);
  if (!binding) return;


  const init = binding.path.node.init;
  if (!init) return;

  if (
    assert.isModuleMethod(path, "loadContext", init) ||
    assert.isModuleMethod(path, "createContext", init)
  ) {
    return binding
  }
}

function getObservableBinding(path, name) {
  const binding = getRootBoundNode(path, name);
  if (!binding) return;


  const init = binding.path.node.init;


  if (!init) {
    return
  }

  if (
    assert.isModuleMethod(path, "observe", init) ||
    assert.isModuleMethod(path, "compute", init)
  )
    return binding;

  if (path.node.type === "Identifier" && path.node.name.startsWith(CONTEXT_PREFIX))
    return binding
}

function findNestedIdentifiers(path, matcher) {
  const found = [];

  path.traverse({
    Identifier(p) {
      if (matcher(p, found)) found.push(p);
    },
  });

  return found;
}

function findNestedObservables(path) {
  return findNestedIdentifiers(path, (p, found) => {
    if (getObservableBinding(p, p.node.name)) {
      return !found.find((n) => n.name === p.node.name);
    }
  });
}

function getFunctionParams(path) {
  if (!path) return [];
  switch (path.node.type) {
    case "FunctionDeclaration":
      return path.node.params || [];
    case "VariableDeclaration": {
      const declaration = path.node.declarations[0];
      if (!declaration || !declaration.init) return [];

      if (declaration.init.type === "ArrowFunctionExpression")
        return declaration.init.params;
      return declaration.init;
    }
    default:
      return [];
  }
}

function findFunctionRoot(path) {
  let foundPath;

  assert.matchParentRecursively(path, (parentPath) => {
    if (assert.isInBlockStatement(path)) {
      foundPath = parentPath;
      return true;
    }
  });

  return foundPath;
}

function findComponentRoot(path) {
  let componentPath;

  assert.matchParentRecursively(path, (parentPath) => {
    if (
      assert.isComponentFunction(parentPath) &&
      assert.isInBlockStatement(path)
    ) {
      componentPath = parentPath;
      return true;
    }
  });

  return componentPath;
}

function findComponentBlockStatement(path) {
  if (findComponentRoot(path))
    return path.find((p) => {
      if (p.node.type === "BlockStatement" && !assert.isInnerFunction(path))
        return true;
    });
}

function findRootBlockStatement(path) {
  let block = null

  path.find((p) => {
    if (p.node.type === "BlockStatement")
      block = p
  });

  return block
}


function findParentVariableDeclarator(path) {
  return path.find((p) => {
    if (p !== path && p.node.type === "VariableDeclarator") {
      return true;
    }
  });
}

module.exports = {
  getJSXProperties,
  getRootBoundNode,
  getContextVariableBinding,
  getObservableBinding,
  findNestedIdentifiers,
  findNestedObservables,
  getFunctionParams,
  findComponentRoot,
  findFunctionRoot,
  findRootBlockStatement,
  findComponentBlockStatement,
  findParentVariableDeclarator,
};
