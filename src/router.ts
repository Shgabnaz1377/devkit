import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'
import HomeView from './views/HomeView.vue'
import { tools } from './tools/registry'

const toolRoutes: RouteRecordRaw[] = tools.map((tool) => ({
  path: `/${tool.id}`,
  name: tool.id,
  component: tool.component,
  meta: { title: tool.name },
}))

export const router = createRouter({
  // Hash history works on every static host without rewrite rules.
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView, meta: { title: 'Home' } },
    ...toolRoutes,
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('./views/NotFoundView.vue') },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

router.afterEach((to) => {
  const title = typeof to.meta.title === 'string' ? to.meta.title : 'Not found'
  document.title = to.name === 'home' ? 'devkit: local developer tools' : `${title} | devkit`
})
