# FocoContext Docs

<script setup>
import { onMounted } from "vue";

onMounted(() => {
  const languages =
    navigator.languages && navigator.languages.length > 0
      ? navigator.languages
      : [navigator.language || "en-US"];
  const locale = languages.some((language) => language.toLowerCase().startsWith("zh"))
    ? "zh-CN"
    : "en-US";
  const basePath = window.location.pathname
    .replace(/index\.html$/u, "")
    .replace(/\/?$/u, "/");
  const target = new URL(`${locale}/`, `${window.location.origin}${basePath}`);

  target.search = window.location.search;
  target.hash = window.location.hash;
  window.location.replace(target.href);
});
</script>

<noscript>
  <p>Choose a documentation language:</p>
  <ul>
    <li><a href="/en-US/">English</a></li>
    <li><a href="/zh-CN/">简体中文</a></li>
  </ul>
</noscript>
