import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import it from "./it.json";
import en from "./en.json";

// R14: every user-facing string is a key with Italian and English values.
const stored = localStorage.getItem("swaptrack.lang");
const initial = stored === "it" || stored === "en" ? stored : navigator.language?.startsWith("it") ? "it" : "en";

void i18n.use(initReactI18next).init({
  resources: { it: { translation: it }, en: { translation: en } },
  lng: initial,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

i18n.on("languageChanged", (l) => {
  localStorage.setItem("swaptrack.lang", l);
  document.documentElement.lang = l;
});
document.documentElement.lang = initial;

export default i18n;
