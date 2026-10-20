export const DEFAULT_TOUR_MUSIC='2';
export const DEFAULT_TOUR_MUSIC_VOLUME=.22;
export const DEFAULT_TOUR_MUSIC_MODE='list';
export const TOUR_MUSIC_MODES=Object.freeze(['list','single','shuffle']);
export const validTourMusicMode=value=>TOUR_MUSIC_MODES.includes(value);
export const normalizeTourMusicMode=value=>validTourMusicMode(value)?value:DEFAULT_TOUR_MUSIC_MODE;
export const validTourMusicVolume=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1;
export const normalizeTourMusicVolume=value=>validTourMusicVolume(value)?value:DEFAULT_TOUR_MUSIC_VOLUME;
export const TOUR_MUSIC_TRACKS=Object.freeze([
  Object.freeze({id:'1',name:'tourMusic1',file:'starlit-drift.mp3'}),
  Object.freeze({id:'2',name:'tourMusic2',file:'stellar-passage.mp3'}),
  Object.freeze({id:'3',name:'tourMusic3',file:'distant-echoes.mp3'}),
]);
export const validTourMusic=value=>value==='off'||TOUR_MUSIC_TRACKS.some(track=>track.id===value);
export const normalizeTourMusic=value=>validTourMusic(value)?value:DEFAULT_TOUR_MUSIC;
