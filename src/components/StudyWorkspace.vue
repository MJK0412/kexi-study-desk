<script setup>
import SliceSidebar from './SliceSidebar.vue';
import PlayerStage from './PlayerStage.vue';
import SliceDetail from './SliceDetail.vue';
import NotesPanel from './NotesPanel.vue';

const emit = defineEmits(['import-subtitles', 'reconnect', 'transcribe']);
</script>

<template>
  <main class="min-h-0 flex-1 overflow-y-auto p-2.5 sm:p-3 lg:overflow-hidden lg:p-4">
    <div class="grid min-h-0 gap-3 lg:h-full lg:grid-cols-[310px_minmax(0,1fr)] lg:gap-3.5 xl:grid-cols-[342px_minmax(0,1fr)]">
      <SliceSidebar
        class="order-2 h-[430px] lg:order-1 lg:h-auto"
        @import-subtitles="emit('import-subtitles')"
        @reconnect="emit('reconnect')"
        @transcribe="emit('transcribe')"
      />

      <section class="order-1 flex min-h-0 flex-col gap-3 lg:order-2">
        <PlayerStage
          class="h-[46vh] min-h-[280px] shrink-0 sm:h-[50vh] lg:h-auto lg:min-h-0 lg:flex-[1.45]"
          @reconnect="emit('reconnect')"
        />

        <div class="grid shrink-0 gap-3 md:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)] lg:min-h-[232px] lg:flex-[0.92] lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <SliceDetail class="h-[310px] md:h-auto md:min-h-[232px]" />
          <NotesPanel class="h-[310px] md:h-auto md:min-h-[232px]" />
        </div>
      </section>
    </div>
  </main>
</template>
