import * as assert from "../assertions.js";
import * as query from "../query.js";
import * as utils from "../utils.js";
import { CONTEXT_PREFIX } from "../constants.js";


const transformVariableDeclaration = (t, path) => {
    path.node.declarations.forEach((decl) => {

        let initType;

        if (assert.isModuleMethod(path, "loadContext", decl.init)) {
            initType = "loadContext"
        }
        if (assert.isModuleMethod(path, "createContext", decl.init)) {
            initType = "createContext"
        }
        if (!initType) return;

        const declarationIdPath = path.get("declarations.0.id")
        if (!declarationIdPath) throw new Error("Missing variable declaration")

        if (decl.id.type === "ObjectPattern") {
            const uniqueId = path.scope.generateUidIdentifier("destructured");

            decl.id.properties.forEach(p => {
                const propName = p.type === "ObjectProperty" ? p.key.name : p.argument.name

                const localBindingName = p.type === "ObjectProperty" ? p.value.name : p.argument.name;
                const binding = path.scope.getBinding(localBindingName);

                if (binding) {
                    [...binding.constantViolations, ...binding.referencePaths].forEach(refPath => {
                        let propertyName = propName
                        if (p.type === "RestElement") {
                            const propNode = refPath.parentPath.node.property;
                            propertyName = propNode.type === "Identifier" ? propNode.name : propNode.value;
                        }

                        const identifierString = `${CONTEXT_PREFIX}${uniqueId.name}_${propertyName}`;

                        const transformedValue = p.type === "RestElement" ?
                            t.memberExpression(t.identifier(refPath.node.name), t.identifier(propertyName)) : t.identifier(propertyName)

                        const hoisted = t.variableDeclaration("const", [
                            t.variableDeclarator(t.identifier(identifierString), transformedValue)
                        ])

                        if (!path.scope.getBinding(identifierString)) {
                            if (initType === "createContext") {
                                const refBlock = query.findRootBlockStatement(refPath)
                                if (!refBlock) return

                                const [newDeclPath] = refBlock.unshiftContainer("body", hoisted);
                                refBlock.scope.registerDeclaration(newDeclPath);
                            } else {
                                const [newDeclPath] = path.insertAfter(hoisted);
                                path.scope.registerDeclaration(newDeclPath);
                            }
                        }


                        if (p.type === "ObjectProperty") {

                            if (refPath.isAssignmentExpression()) {
                                refPath.replaceWith(t.assignmentExpression(refPath.node.operator, t.identifier(identifierString), refPath.node.right));
                            } else {
                                refPath.replaceWith(
                                    t.identifier(identifierString)
                                );
                            }

                        } else if (refPath.parentPath.isMemberExpression()) {
                            refPath.parentPath.replaceWith(t.identifier(identifierString));
                        }
                    });
                }
            });
        }

        if (decl.id.type === "Identifier") {
            const varName = decl.id.name;
            const binding = path.scope.getBinding(varName);
            if (!binding) return

            binding.referencePaths.forEach((refPath) => {
                const refBlock = query.findRootBlockStatement(refPath)

                const identifierString = `${CONTEXT_PREFIX}${refPath.node.name}_${refPath.parentPath.node.property.name}`
                if (!identifierString) return

                const isBindingHoisted = refBlock.get("body").find((p) => {
                    return p.isVariableDeclaration() && p.node.declarations.some(d => d.id.name === identifierString)
                });
                if (!isBindingHoisted) {
                    const hoisted = t.variableDeclaration("const", [
                        t.variableDeclarator(t.identifier(identifierString), t.memberExpression(t.identifier(refPath.node.name), t.identifier(refPath.parentPath.node.property.name)))
                    ])

                    if (initType === "createContext") {
                        const refBlock = query.findRootBlockStatement(refPath)
                        if (!refBlock) return

                        const [newDeclPath] = refBlock.unshiftContainer("body", hoisted);
                        refBlock.scope.registerDeclaration(newDeclPath);
                    } else {
                        const [newDeclPath] = path.insertAfter(hoisted);
                        path.scope.registerDeclaration(newDeclPath);
                    }

                }

                refPath.parentPath.replaceWith(t.identifier(identifierString));
            });

        }
    })
}



export default {
    name: "Transform Context",
    preJSX: {
        VariableDeclaration: transformVariableDeclaration,
    }
}