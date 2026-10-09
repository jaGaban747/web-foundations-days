# Library API Design

A REST API for a library's **books** resource. All requests and responses use JSON. The base path is `/api`.

## Book object

* `id`: number, assigned by the server
* `title`: string, required
* `author`: string, required
* `isbn`: string, optional
* `publishedYear`: number, optional

## Endpoints

### 1. List all books

* **Method and path:** `GET /api/books`
* **Description:** Returns every book in the library.
* **Request body:** none
* **Success status:** `200 OK`

### 2. Get one book

* **Method and path:** `GET /api/books/{id}`
* **Description:** Returns the single book with the given id.
* **Request body:** none
* **Success status:** `200 OK`

### 3. Create a book

* **Method and path:** `POST /api/books`
* **Description:** Adds a new book to the library.
* **Example request body:**

```json
{
  "title": "Things Fall Apart",
  "author": "Chinua Achebe",
  "isbn": "9780385474542",
  "publishedYear": 1958
}
```

* **Success status:** `201 Created`

### 4. Update a book

* **Method and path:** `PUT /api/books/{id}`
* **Description:** Replaces the details of an existing book.
* **Example request body:**

```json
{
  "title": "Things Fall Apart",
  "author": "Chinua Achebe",
  "isbn": "9780385474542",
  "publishedYear": 1959
}
```

* **Success status:** `200 OK`

### 5. Delete a book

* **Method and path:** `DELETE /api/books/{id}`
* **Description:** Removes the book with the given id.
* **Request body:** none
* **Success status:** `204 No Content`

### 6. List books by an author

* **Method and path:** `GET /api/books?author=Chinua%20Achebe`
* **Description:** Returns only the books written by the author given in the query parameter.
* **Request body:** none
* **Success status:** `200 OK` (an empty list `[]` if the author has no books)

## Error codes

### 400 Bad Request

The request is malformed or fails validation.

* **Example:** `POST /api/books` with a body that has no `title`, or `PUT /api/books/3` where `publishedYear` is the text "nineteen".
* **Example response body:**

```json
{ "error": "The field 'title' is required." }
```

### 404 Not Found

The requested book does not exist.

* **Example:** `GET /api/books/9999` when no book has the id 9999. The same applies to `PUT` and `DELETE` on a missing id.
* **Example response body:**

```json
{ "error": "Book with id 9999 was not found." }
```