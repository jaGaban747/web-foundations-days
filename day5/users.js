// 1. Select the elements
const loadButton = document.querySelector("#load-users");
const filterInput = document.querySelector("#filter-input");
const statusEl = document.querySelector("#status");
const usersList = document.querySelector("#users-list");

const API_URL = "https://jsonplaceholder.typicode.com/users";

// 2. Stored users: filtering uses this array, so it never needs a new request
let users = [];

// 3. Draw any array of users
function renderUsers(list) {
  usersList.replaceChildren();

  if (list.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "No users match your filter.";
    usersList.append(empty);
    return;
  }

  list.forEach((user) => {
    const li = document.createElement("li");

    const name = document.createElement("strong");
    name.textContent = user.name;

    const email = document.createElement("div");
    email.textContent = `Email: ${user.email}`;

    const city = document.createElement("div");
    city.textContent = `City: ${user.address.city}`;

    const company = document.createElement("div");
    company.textContent = `Company: ${user.company.name}`;

    li.append(name, email, city, company);
    usersList.append(li);
  });
}

// 4. Filter the stored array (case insensitive)
function applyFilter() {
  if (users.length === 0) return;
  const term = filterInput.value.trim().toLowerCase();
  const matches = users.filter((user) =>
    user.name.toLowerCase().includes(term)
  );
  renderUsers(matches);
}

// 5. Load users from the API
async function loadUsers() {
  loadButton.disabled = true;
  statusEl.textContent = "Loading users...";

  try {
    const response = await fetch(API_URL);

    if (!response.ok) {
      throw new Error(`Server responded with status ${response.status}`);
    }

    users = await response.json();
    applyFilter();
    statusEl.textContent = `Loaded ${users.length} users.`;
  } catch (error) {
    users = [];
    usersList.replaceChildren();
    statusEl.textContent = `Could not load users: ${error.message}`;
  } finally {
    loadButton.disabled = false;
  }
}

// 6. Listeners
loadButton.addEventListener("click", loadUsers);
filterInput.addEventListener("input", applyFilter);