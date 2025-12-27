# TODO

- Add other operators ('==', '!=', '<', '<=', '>', '>=')
- Add logical not
- Right now `parseOutputForTypeId` only strips an exact ```json fence and otherwise tries `JSON.parse(raw)`. In practice models often return:
  - leading/trailing prose
  - multiple code blocks
  - JSON in a non-`json` fence
  - “almost JSON” (single quotes, trailing commas)
  - an object when you asked for an array, etc.


Explore implementing (in this order):
- comparison operators (`==`, `!=`, `<`, `<=`, `>`, `>=`)
- assignment expressions in more places (you already have `WithAssignments` but calls use `WithoutAssignments`)
- string literals in expressions (so `let x = "hi"` is possible)
- logical not `!`


