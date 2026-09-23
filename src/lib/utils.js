import * as query from "./query.js";
import * as assert from "./assertions.js"
import generatePkg from "@babel/generator";
const generate = generatePkg.default || generatePkg;


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
  if (!path) return false
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


function findNestedObservables(path) {
  const filteredNodes = []

  const observables = query.findNestedIdentifiers(path, (p, found) => {
    if (isPropIdentifier(p)) return true;
    if (p?.isIdentifier()) {
      if (query.getObservableBinding(p, p.node.name)) {
        return true;
      }
    }
  });

  observables.forEach(p => {
    if (!filteredNodes.find(fp => fp.node.name === p.node.name)) {
      filteredNodes.push(p)
    }
  })

  return filteredNodes
}



function transformObjectPatternToIdentifier(t, path, identifier = "props") {
  if (!path || !path.isObjectPattern()) return

  const uniqueId = path.scope.generateUidIdentifier(identifier);

  path.node.properties.forEach(prop => {
    const binding = path.scope.getBinding(prop.value.name);
    if (!binding) return

    binding.referencePaths.forEach(p => {
      p.replaceWith(t.memberExpression(uniqueId, p.node));
    })

    binding.constantViolations.forEach(p => {
      if (p.isAssignmentExpression()) {
        p.replaceWith(t.assignmentExpression(p.node.operator, t.memberExpression(uniqueId, p.node), p.node.right));
      } else {
        p.replaceWith(t.memberExpression(uniqueId, p.node));
      }
    })
  })

  path.replaceWith(uniqueId)
  path.scope.crawl()

}


export function flattenMemberExpression(t, node) {
  const parts = [];
  let currentNode = node;

  while (true) {
    if (t.isIdentifier(currentNode)) {
      parts.unshift(currentNode.name);
      break;
    }

    // Handle both standard dot notation and optional chaining (?.)
    if (t.isMemberExpression(currentNode) || t.isOptionalMemberExpression(currentNode)) {
      let propertyPart;
      const prop = currentNode.property;

      if (!currentNode.computed && t.isIdentifier(prop)) {
        propertyPart = prop.name;
      } else if (currentNode.computed && t.isStringLiteral(prop)) {
        propertyPart = prop.value;
      } else if (currentNode.computed && t.isNumericLiteral(prop)) {
        propertyPart = String(prop.value);
      } else {
        return null;
      }

      parts.unshift(propertyPart);
      currentNode = currentNode.object;
    } else {
      return null;
    }
  }

  return parts;
}


function transformObservableMemberExpToFlatIdentifier(t, parentPath) {
  return
  parentPath.traverse({
    MemberExpression(path) {
      if (!assert.isRootMemberExpReference(path)) return

      const [firstPart, ...rest] = flattenMemberExpression(path.node)
      const newIdentifier = [uniqueId.name, firstPart, ...rest].join("_")





      const binding = query.getObservableBinding(path, path.node.object.name)
      if (!binding) return

      const uniqueId = parentPath.scope.generateUidIdentifier(OBSERVABLE_PREFIX);



      binding.referencePaths.forEach(p => {

      })

    }
  })

  // const uniqueId = parentPath.scope.generateUidIdentifier("props");
  // parentPath.node.properties.forEach(prop => {
  //   const binding = parentPath.scope.getBinding(prop.value.name);
  //   if (!binding) return

  //   binding.referenceparentPaths.forEach(p => {
  //     p.replaceWith(t.memberExpression(uniqueId, p.node));
  //   })

  //   binding.constantViolations.forEach(p => {
  //     if (p.isAssignmentExpression()) {
  //       p.replaceWith(t.assignmentExpression(p.node.operator, t.memberExpression(uniqueId, p.node), p.node.right));
  //     } else {
  //       p.replaceWith(t.memberExpression(uniqueId, p.node));
  //     }
  //   })
  // })

  // parentPath.replaceWith(uniqueId)
  parentPath.scope.crawl()

}


function transformArrowFunctionBodyToBlockStatement(t, path) {
  if (!path || path.type !== "ArrowFunctionExpression" || path.node?.body?.type === "BlockStatement") return


  let exp = path.node.body

  if (!t.isExpression(exp)) {
    throw new Error("Body isnt a valid expression to transform")
  }

  path.replaceWith(
    t.arrowFunctionExpression(
      path.node.params,
      t.blockStatement([
        t.returnStatement(exp)
      ])
    )
  )

  path.scope.crawl()
}


export {
  isPropIdentifier,
  findNestedObservables,
  transformCallee,
  transformObjectPatternToIdentifier,
  transformArrowFunctionBodyToBlockStatement,
  transformObservableMemberExpToFlatIdentifier
};
