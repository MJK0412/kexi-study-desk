<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import {
  Check,
  ChevronDown,
  Clock3,
  FileVideo2,
  FolderOpen,
  Plus,
  Trash2,
} from 'lucide-vue-next';
import {
  activeCourse,
  hasCachedVideo,
  state,
  switchCourse,
} from '../stores/studio.js';
import { formatDate, formatTime } from '../lib/time.js';

const emit = defineEmits(['open-video', 'delete-course']);
const open = ref(false);
const root = ref(null);

function toggle() {
  if (!activeCourse.value) return;
  open.value = !open.value;
}

async function choose(course) {
  open.value = false;
  if (course.id !== state.activeCourseId) await switchCourse(course.id);
}

function startNew() {
  open.value = false;
  emit('open-video');
}

function removeCurrent() {
  open.value = false;
  emit('delete-course');
}

function onDocumentPointer(event) {
  if (root.value && !root.value.contains(event.target)) open.value = false;
}

function onKeydown(event) {
  if (event.key === 'Escape') open.value = false;
}

onMounted(() => {
  document.addEventListener('mousedown', onDocumentPointer);
  document.addEventListener('keydown', onKeydown);
});
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocumentPointer);
  document.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <div ref="root" class="relative min-w-0">
    <button
      type="button"
      class="focus-ring group flex w-full max-w-[290px] items-center gap-2.5 rounded-xl border border-line/80 bg-surface/75 px-3 py-2 text-left transition hover:border-line-strong hover:bg-surface-strong"
      :aria-expanded="open"
      aria-haspopup="listbox"
      @click="toggle"
    >
      <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-pine-soft text-pine">
        <FileVideo2 :size="16" :stroke-width="1.8" />
      </span>
      <span class="min-w-0 flex-1">
        <span class="block truncate text-[12.5px] font-semibold leading-5 text-ink">
          {{ activeCourse?.name || '选择课程' }}
        </span>
        <span class="flex items-center gap-1.5 text-[10.5px] leading-4 text-faint">
          <span class="truncate">{{ activeCourse?.sliceCount ?? 0 }} 个切片</span>
          <span v-if="activeCourse && !(state.videoFile || state.videoUrl)" class="text-amber">· 视频未连接</span>
        </span>
      </span>
      <ChevronDown
        :size="15"
        class="shrink-0 text-faint transition-transform duration-200 group-hover:text-ink"
        :class="{ 'rotate-180': open }"
      />
    </button>

    <Transition name="menu">
      <div
        v-if="open"
        class="absolute left-0 top-[calc(100%+8px)] z-50 w-[340px] overflow-hidden rounded-xl border border-line bg-surface-strong shadow-lift"
        role="listbox"
        aria-label="课程列表"
      >
        <div class="flex items-center justify-between border-b border-line/70 px-3.5 py-2.5">
          <p class="text-[10px] font-semibold uppercase tracking-[0.18em] text-faint">本机课程</p>
          <p class="text-[10.5px] text-faint">{{ state.courses.length }} 门</p>
        </div>

        <div class="max-h-[310px] overflow-y-auto p-1.5">
          <button
            v-for="course in state.courses"
            :key="course.id"
            type="button"
            class="focus-ring group flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2.5 text-left transition hover:bg-paper"
            :class="{ 'bg-paper/80': course.id === state.activeCourseId }"
            role="option"
            :aria-selected="course.id === state.activeCourseId"
            @click="choose(course)"
          >
            <span
              class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition"
              :class="
                course.id === state.activeCourseId
                  ? 'border-pine bg-pine text-surface-strong'
                  : 'border-line-strong text-transparent'
              "
            >
              <Check :size="11" :stroke-width="2.5" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-[12.5px] font-medium leading-5 text-ink">{{ course.name }}</span>
              <span class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px] leading-4 text-faint">
                <span class="inline-flex items-center gap-1">
                  <Clock3 :size="10" />
                  {{ formatTime(course.duration || 0) }}
                </span>
                <span>{{ course.sliceCount ?? 0 }} 段</span>
                <span>{{ formatDate(course.updatedAt) }}</span>
                <span
                  v-if="course.id !== state.activeCourseId && !hasCachedVideo(course.id)"
                  class="text-amber/90"
                >需重连视频</span>
              </span>
            </span>
          </button>
        </div>

        <div class="border-t border-line/70 p-1.5">
          <button
            type="button"
            class="focus-ring flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12px] font-medium text-pine transition hover:bg-pine-soft"
            @click="startNew"
          >
            <Plus :size="15" />
            打开另一节视频
          </button>
          <button
            v-if="activeCourse"
            type="button"
            class="focus-ring flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12px] font-medium text-clay transition hover:bg-clay-soft"
            @click="removeCurrent"
          >
            <Trash2 :size="14" />
            删除当前课程
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.menu-enter-active,
.menu-leave-active {
  transition:
    opacity 150ms ease,
    transform 150ms ease;
}
.menu-enter-from,
.menu-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.99);
}
</style>
