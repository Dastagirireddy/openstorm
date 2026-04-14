<script setup lang="ts">
import { ref } from 'vue'

const count = ref(0)
</script>

<template>
  <div class="container">
    <h1>{{project-name}}</h1>
    <div class="card">
      <button @click="count++">count is {{ count }}</button>
    </div>
  </div>
</template>

<style scoped>
.container {
  max-width: 1280px;
  margin: 0 auto;
  padding: 2rem;
  text-align: center;
}

.card {
  padding: 2em;
}

button {
  padding: 0.6em 1.2em;
  font-size: 1em;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  border: 1px solid transparent;
  border-radius: 8px;
  background-color: #42b883;
  color: #fff;
  transition: border-color 0.25s;
}

button:hover {
  border-color: #35495e;
}
</style>
