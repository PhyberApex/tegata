<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import DatabaseIntegrityBanner from './components/DatabaseIntegrityBanner.vue'
import { useAuth } from './composables/useAuth'
import { useDatabaseIntegrity } from './composables/useDatabaseIntegrity'
import { useLogLevel } from './composables/useLogLevel'

const route = useRoute()
const { authenticated, role, logout } = useAuth()
const { current: logLevel, levels: logLevels, setLevel, load: loadLogLevel } = useLogLevel()
const { startPolling, stopPolling } = useDatabaseIntegrity()

const isPublicRoute = computed(() => route.meta.public === true)
const showNav = computed(() => authenticated.value && !isPublicRoute.value)
const showAdminNav = computed(() => showNav.value && role.value === 'admin')

watch(showAdminNav, (isAdmin) => {
  if (isAdmin) {
    startPolling()
    loadLogLevel()
  }
  else {
    stopPolling()
  }
}, { immediate: true })

function onLogLevelChange(e: Event) {
  setLevel((e.target as HTMLSelectElement).value as typeof logLevel.value)
}
</script>

<template>
  <div class="app">
    <header v-if="showNav" class="header">
      <div class="header-brand">
        <span class="header-logo">&#x624B;&#x5F62;</span>
        <span class="header-title">Tegata</span>
      </div>
      <nav v-if="role === 'admin'" class="header-nav">
        <RouterLink to="/" class="nav-link" active-class="nav-link--active">
          Users
        </RouterLink>
        <RouterLink to="/invites" class="nav-link" active-class="nav-link--active">
          Invites
        </RouterLink>
        <RouterLink to="/groups" class="nav-link" active-class="nav-link--active">
          Groups
        </RouterLink>
        <RouterLink to="/bundles" class="nav-link" active-class="nav-link--active">
          Bundles
        </RouterLink>
      </nav>
      <div class="header-actions">
        <select
          v-if="showAdminNav"
          :value="logLevel"
          class="tg-input log-level-select"
          aria-label="Log level"
          @change="onLogLevelChange"
        >
          <option v-for="level in logLevels" :key="level" :value="level">
            {{ level }}
          </option>
        </select>
        <button class="tg-btn tg-btn-ghost" @click="logout">
          Logout
        </button>
      </div>
    </header>
    <DatabaseIntegrityBanner v-if="showAdminNav" />
    <main class="main" :class="{ 'main--public': isPublicRoute }">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.header {
  display: flex;
  align-items: center;
  gap: var(--tg-space-xl);
  padding: var(--tg-space-md) var(--tg-space-xl);
  background: var(--tg-bg-raised);
  border-bottom: 1px solid var(--tg-border);
}

.header-brand {
  display: flex;
  align-items: center;
  gap: var(--tg-space-sm);
}

.header-logo {
  font-size: var(--tg-font-xl);
}

.header-title {
  font-size: var(--tg-font-lg);
  font-weight: 600;
  color: var(--tg-text-primary);
  letter-spacing: 0.02em;
}

.header-nav {
  display: flex;
  gap: var(--tg-space-xs);
  flex: 1;
}

.nav-link {
  padding: var(--tg-space-xs) var(--tg-space-md);
  color: var(--tg-text-secondary);
  text-decoration: none;
  border-radius: var(--tg-radius-md);
  font-size: var(--tg-font-sm);
  font-weight: 500;
  transition: all 0.15s var(--tg-ease);
}

.nav-link:hover {
  color: var(--tg-text-primary);
  background: var(--tg-bg-overlay);
}

.nav-link--active {
  color: var(--tg-accent);
  background: var(--tg-accent-muted);
}

.header-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: var(--tg-space-sm);
}

.log-level-select {
  width: 7rem;
  font-size: var(--tg-font-xs);
  padding-block: var(--tg-space-xs);
}

.main {
  flex: 1;
  padding: var(--tg-space-xl);
  max-width: 960px;
  width: 100%;
  margin: 0 auto;
}

.main--public {
  display: flex;
  align-items: center;
  justify-content: center;
  max-width: 100%;
  padding: 0;
}
</style>
