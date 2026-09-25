# CODE_STYLE.md

## Controller Export Patterns

The project uses two distinct export styles for controllers:

1. **Named function map export** – used by `users.controller.js` and `content.controller.js` (when a factory is not needed).
   ```js
   // Example from users.controller.js
   function list(req, res) { /* ... */ }
   function get(req, res) { /* ... */ }
   function create(req, res) { /* ... */ }
   function update(req, res) { /* ... */ }
   function remove(req, res) { /* ... */ }

   module.exports = { list, get, create, update, remove };
   ```
   The exported object is a plain map where each key is the **function name**, **not** an HTTP‑verb map.

2. **Factory export with a named object** – used by `content.controller.js` (returns a controller for a specific content type) and `quiz.controller.js` (exports individual handler functions).
   ```js
   // Example from content.controller.js
   function makeContentController(contentType) { /* … */ }
   module.exports = { makeContentController };
   ```
   ```js
   // Example from quiz.controller.js
   exports.createSession = (req, res) => { /* … */ };
   exports.submitAnswer = (req, res) => { /* … */ };
   exports.getResult = (req, res) => { /* … */ };
   ```
   Here each export is a **named function**, not a map of verbs.

### Planned New Controllers
- **learning.controller.js**, **history.controller.js**, **statistics.controller.js** will follow the **named function map** style exactly like `users.controller.js`:
  ```js
  module.exports = { list, get, create, update, remove };
  ```
- **image.controller.js** will mirror `quiz.controller.js` and export individual handler functions (e.g., `exports.search = …`).

All controllers will import the shared error handler from `server/utils/error-handler.js` and will contain **no business logic** – they simply forward to the corresponding service and let errors bubble up.
