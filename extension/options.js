const STORAGE_KEY = "wm_api_base_url";
const DEFAULT_API_BASE_URL = "http://localhost:3000";

const apiBaseUrlInput = document.getElementById("apiBaseUrl");
const saveButton = document.getElementById("saveButton");
const status = document.getElementById("status");

function storageGet(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => resolve(result[key]));
  });
}

function storageSet(value) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: value }, () => resolve());
  });
}

async function initialize() {
  const stored = await storageGet(STORAGE_KEY);
  if (typeof stored === "string" && stored.trim().length > 0) {
    apiBaseUrlInput.value = stored;
  } else {
    apiBaseUrlInput.value = DEFAULT_API_BASE_URL;
  }
}

saveButton.addEventListener("click", async () => {
  const value = apiBaseUrlInput.value.trim().replace(/\/$/, "");
  if (!value) {
    status.textContent = "Please enter a valid URL.";
    return;
  }

  await storageSet(value);
  status.textContent = "Saved.";
});

initialize();
