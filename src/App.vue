<script setup lang="ts">
import { onMounted } from 'vue';
import { useProjectStore } from './stores/projectStore';
import HeaderBar from './components/HeaderBar.vue';
import SetupScreen from './components/SetupScreen.vue';
import EditorSidebar from './components/EditorSidebar.vue';
import BasicsPage from './components/BasicsPage.vue';
import OptionsPage from './components/OptionsPage.vue';
import TimingsEditor from './components/TimingsEditor.vue';
import VideoExportPage from './components/VideoExportPage.vue';
import UvrGuideModal from './components/UvrGuideModal.vue';
import ResyncModal from './components/ResyncModal.vue';

const project = useProjectStore();

onMounted(() => {
  void project.detectSystemCapabilities();
});
</script>

<template>
  <div class="h-screen w-screen flex flex-col bg-white text-slate-900 overflow-hidden">
    <!-- Top Musical Staff Header -->
    <HeaderBar />

    <!-- Screen 0: Initial Song & Lyrics Setup (Slide 1) -->
    <SetupScreen v-if="project.screen === 'setup'" />

    <!-- Screen 1: Croonify-Inspired 6-Tab Editor Workspace (Slides 2–7) -->
    <div v-else class="flex-1 flex overflow-hidden">
      <EditorSidebar />

      <main class="flex-1 min-w-0 overflow-hidden bg-white">
        <BasicsPage v-if="project.activeTab === 'basics'" />
        <OptionsPage v-else-if="project.activeTab === 'options'" />
        <TimingsEditor v-else-if="project.activeTab === 'line-timings'" mode="line" />
        <TimingsEditor v-else-if="project.activeTab === 'word-timings'" mode="word" />
        <VideoExportPage v-else-if="project.activeTab === 'video'" />
      </main>
    </div>

    <!-- Modals -->
    <UvrGuideModal />
    <ResyncModal />
  </div>
</template>
