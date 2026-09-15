import * as assert from "../assertions.js";
import * as query from "../query.js";
import * as utils from "../utils.js";
import generatePkg from "@babel/generator";
import { LIB_NAME, REACTIVE_LIST, REACTIVE_LIST_KEY_PROP } from "../constants.js";
const generate = generatePkg.default || generatePkg;


const transformCallExpression = (t, path) => {
    if (path?.parent?.type !== "JSXExpressionContainer") return
    if (!assert.isCallMemberExpExpression(path, "map")) return;

    const obj = path.node.callee?.object
    if (obj?.type !== "Identifier") return

    let propIdentifier = false;
    path.traverse({
        Identifier: (idPath) => {
            if (idPath.node === obj) {
                propIdentifier = utils.isPropIdentifier(idPath)
            }
        }
    })


    if (!query.getObservableBinding(path, obj.name) && !propIdentifier) return

    const data = obj.name


    const firstArg = path.node?.arguments?.[0]

    if (firstArg?.type !== "ArrowFunctionExpression") {
        return
    }

    const id = firstArg?.params?.[0]
    const body = firstArg.body
    const openingElement = body?.openingElement
    const keyExp = openingElement?.attributes?.find(attr => {
        if (attr.name?.name === "key") {
            if (attr.value?.type === "JSXExpressionContainer") {
                return attr.value.expression
            }
        }
    })

    if (!id || !keyExp || !body) return

    const getKeyArrowFunc = t.arrowFunctionExpression(firstArg.params, keyExp.value.expression)
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

        let data = null;
        let key = null;
        let children = t.arrayExpression([]);
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

        path.traverse({
            JSXElement: (path) => transformJSXElement(t, path, true),
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
        body = t.arrowFunctionExpression(body.params, body.body)

        const callee = t.memberExpression(reactIdentifier, t.identifier(fnName));
        const callExpression = t.callExpression(callee, [
            data,
            t.objectExpression([t.objectProperty(t.identifier("getKey"), key)]),
            body,
        ]);


        path.replaceWith(callExpression, path.node)
    }

};

export default {
    name: "Transform Reactive List",
    preJSX: {
        CallExpression: transformCallExpression,
    },
    JSX: {
        JSXElement: transformJSXElement
    }
}