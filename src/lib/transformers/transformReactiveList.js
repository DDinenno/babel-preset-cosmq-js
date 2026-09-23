import * as assert from "../assertions.js";
import * as query from "../query.js";
import * as utils from "../utils.js";
import { LIB_NAME, REACTIVE_LIST, REACTIVE_LIST_ELEMENT, REACTIVE_LIST_INDEX, REACTIVE_LIST_KEY_PROP } from "../constants.js";

const transformReactiveListBodyVariables = (t, path) => {
    const reactiveListIndexId = t.identifier(REACTIVE_LIST_INDEX);
    const reactiveListElementId = t.identifier(REACTIVE_LIST_ELEMENT);
    const elementParam = path.node?.params?.[0]

    if (elementParam) {
        const binding = path.scope.getBinding(elementParam.name);

        if (binding) {
            binding.referencePaths.forEach((refPath) => {
                refPath.replaceWith(reactiveListElementId);
            })

            path.scope.rename(elementParam.name, reactiveListElementId.name);
        }

        path.scope.rename(elementParam.name, reactiveListElementId.name);
    }

    const idxParam = path.node?.params?.[1]

    if (idxParam) {
        const bPath = path.get('body');

        if (bPath) {
            const idxBinding = bPath.scope.getBinding(idxParam?.name)
            if (!idxBinding) {
                return
            }

            idxBinding.referencePaths.forEach((refPath) => {
                refPath.replaceWith(t.memberExpression(reactiveListElementId, reactiveListIndexId));
            });

            path.replaceWith(t.arrowFunctionExpression([reactiveListElementId], path.node.body))
        }
    }
}

const transformArrowFunctionExpression = (t, path) => {
    if (path?.parent?.type === "JSXExpressionContainer") {
        const parentOfParent = path?.parentPath?.parentPath
        if (!parentOfParent) return

        if (parentOfParent?.node?.type === "JSXElement" && parentOfParent?.node?.openingElement?.name?.name === "ReactiveList") {

            // normalizes parameters of the arrow function to an identifier, to handle only the one type
            utils.transformObjectPatternToIdentifier(t, path.get('params.0'))
            path.scope.crawl()

            utils.transformArrowFunctionBodyToBlockStatement(t, path.get('body'))
            path.scope.crawl()

            transformReactiveListBodyVariables(t, path)
            path.scope.crawl()

            return
        }

        return
    }
}

const transformCallExpression = (t, path) => {
    if (path?.parent?.type !== "JSXExpressionContainer") return
    if (!assert.isCallMemberExpExpression(path, "map")) return;

    const obj = path.node.callee?.object
    if (obj?.type !== "Identifier") return


    const objPath = path.get('callee.object');
    const propIdentifier = utils.isPropIdentifier(objPath)



    if (!query.getObservableBinding(path, obj.name) && !propIdentifier) return

    const data = obj.name


    let firstArg = path.node?.arguments?.[0]
    if (firstArg?.type !== "ArrowFunctionExpression") {
        return
    }

    // normalizes parameters of the arrow function to an identifier, to handle only the one type
    utils.transformObjectPatternToIdentifier(t, path.get('arguments.0.params.0'))
    path.scope.crawl()

    utils.transformArrowFunctionBodyToBlockStatement(t, path.get('arguments.0.body'))
    path.scope.crawl()

    firstArg = path.node?.arguments?.[0]


    let keyExp
    let body = path.node?.arguments?.[0]?.body
    if (!body) return

    if (body?.type === "BlockStatement") {
        body?.body?.forEach(stmt => {
            if (stmt?.type !== "ReturnStatement") return
            const firstArg = stmt.argument
            if (firstArg?.type !== "JSXElement") return

            const openingElement = firstArg?.openingElement
            openingElement?.attributes?.forEach(attr => {
                if (attr.name?.name === "key") {
                    if (attr.value?.type === "JSXExpressionContainer") {
                        keyExp = attr.value.expression
                    }
                }
            })
        })
    } else {
        const openingElement = body?.openingElement
        openingElement?.attributes?.forEach(attr => {
            if (attr.name?.name === "key") {
                if (attr.value?.type === "JSXExpressionContainer") {
                    keyExp = attr.value.expression
                }
            }
        })
    }

    if (!keyExp) throw new Error("Mapping a observable array requires a key prop in the JSX element")


    const clonedKeyExp = t.cloneNode(keyExp, true);
    const clonedParams = firstArg?.params
        ? firstArg.params.map(p => t.cloneNode(p, true))
        : [];

    const getKeyArrowFunc = t.arrowFunctionExpression(clonedParams, clonedKeyExp);

    const firstArgPath = path.get('arguments.0');
    if (!firstArgPath || !firstArgPath.isArrowFunctionExpression()) return

    transformReactiveListBodyVariables(t, firstArgPath)
    path.scope.crawl()

    firstArg = t.cloneWithoutLoc(path.node)?.arguments?.[0]
    const id = firstArg?.params?.[0]
    body = firstArg.body



    if (!id || !keyExp || !body) return


    const bodyArrowFunc = t.arrowFunctionExpression(firstArg.params, body)


    const callee = t.memberExpression(t.identifier(LIB_NAME), t.identifier(REACTIVE_LIST));
    const callExpression = t.callExpression(callee, [
        t.identifier(data),
        t.objectExpression([t.objectProperty(t.identifier(REACTIVE_LIST_KEY_PROP), getKeyArrowFunc)]),
        bodyArrowFunc
    ]);

    t.addComment(callExpression, "leading", "COSMQ - Injected ReactiveList", false);
    path.replaceWith(callExpression)
}


const transformJSXElement = (t, path, inner = false) => {
    var openingElement = path.node.openingElement;
    var tagName = openingElement.name.name;
    var reactIdentifier = t.identifier("Cosmq");

    if (tagName === "ReactiveList") {
        const fnName = "reactiveList";

        const arrowFnPath = path.get("children.0.expression")

        if (arrowFnPath?.type !== "ArrowFunctionExpression") {
            throw new Error("ReactiveList required an arrow function in the children")
        }

        let data = null;
        let key = null;
        let body = null
        const openingEl = path.node.openingElement

        if (!path.node.children || path.node.children.length === 0) throw new Error("Missing children in ReactiveList")
        path.node.children.forEach(child => {
            if (child.type === "JSXText") return
            if (child.type === "JSXExpressionContainer" && child.expression.type === "ArrowFunctionExpression") {
                body = child.expression
            } else {
                throw new Error("Expexted a arrow function expression as a child of ReactiveList")
            }
        })

        if (!openingEl.attributes || !openingEl.attributes.length) throw new Error("Missing data attribute in ReactiveList")

        openingEl.attributes.forEach((attr) => {
            if (attr.type === "JSXSpreadAttribute") {
                throw new Error("Spread attributes are not supported in ReactiveList");
            }

            if (attr.name.name === "data") {
                data = attr.value.expression
            }

            if (attr.name.name === "key" && attr.value.type === "JSXExpressionContainer") {
                key = attr.value.expression
            }
        });

        if (!key) {
            throw new Error("Missing required prop 'key' in ReactiveList")
        }

        if (!data) {
            throw new Error("Missing required prop 'data' in ReactiveList")
        }

        if (!body) {
            throw new Error("Missing required child in ReactiveList")
        }

        if (body.type !== "ArrowFunctionExpression") throw new Error("Invalid body type in ReactiveList")
        const arrowFnBody = t.cloneWithoutLoc(body)

        const callee = t.memberExpression(reactIdentifier, t.identifier(fnName));
        const callExpression = t.callExpression(callee, [
            data,
            t.objectExpression([t.objectProperty(t.identifier("getKey"), key)]),
            arrowFnBody,
        ]);

        path.replaceWith(callExpression)
    }
};

export default {
    name: "Transform Reactive List",
    preJSX: {
        CallExpression: transformCallExpression,
        ArrowFunctionExpression: transformArrowFunctionExpression
    },
    JSX: {
        JSXElement: transformJSXElement
    }
}