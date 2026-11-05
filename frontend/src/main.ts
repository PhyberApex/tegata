import { createApp } from 'vue'
import App from './App.vue'
import { useSiteName } from './composables/useSiteName'
import router from './router'
import './assets/tokens.css'

// Fire and forget: the default name shows until the backend answers.
useSiteName().loadSiteName()

createApp(App).use(router).mount('#app')
