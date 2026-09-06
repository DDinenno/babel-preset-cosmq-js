function findNearestAncestor(path, matcher) {
  if (!path) return null;
  if (matcher(path)) return path;
  return findNearestAncestor(path.parentPath, matcher);
}

function _mapPropertyValue(node) {
  if (node == null) {
    return t.booleanLiteral(true);
  } else if (node.type === "JSXExpressionContainer") return node.expression;
  else if (node.type === "JSXExpressionContainer") return node.expression;
  return node;
}

function getJSXProperties(t, path, component = false) {
  const attrsObject = t.objectExpression([]);
  const attributes = path.node.openingElement.attributes;
  const properties = [];

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

module.exports = {
  findNearestAncestor,
  getJSXProperties
};
