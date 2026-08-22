/** 방에 있는 몹 이름 -> 스프라이트 경로. 등록되지 않은 몹은 텍스트로만 표시된다. */
export const MOB_SPRITES: Readonly<Record<string, string>> = Object.freeze({
  쥐: '/mobs/rat.png',
  고블린: '/mobs/goblin.png',
  덩굴괴수: '/mobs/vine.png',
  가시덩굴괴수: '/mobs/thorn-vine.png',
  맹독가시괴수: '/mobs/venom-vine.png',
  '심연의 덩굴괴수': '/mobs/abyss-vine.png',
  '태고의 덩굴괴수': '/mobs/ancient-vine.png',
  불도마뱀: '/mobs/salamander.png',
  화염도마뱀: '/mobs/flame-salamander.png',
  작열도마뱀: '/mobs/blaze-salamander.png',
  지옥불도마뱀: '/mobs/hellfire-salamander.png',
  '태고의 불도마뱀': '/mobs/ancient-salamander.png',
  바위골렘: '/mobs/golem.png',
  강철골렘: '/mobs/steel-golem.png',
  흑요석골렘: '/mobs/obsidian-golem.png',
  '심연의 골렘': '/mobs/abyss-golem.png',
  '태고의 골렘': '/mobs/ancient-golem.png',
  강철전갈: '/mobs/scorpion.png',
  독침전갈: '/mobs/venom-scorpion.png',
  사혈전갈: '/mobs/blood-scorpion.png',
  흑철전갈: '/mobs/blackiron-scorpion.png',
  '태고의 전갈': '/mobs/ancient-scorpion.png',
  늪지악어: '/mobs/swamp-crocodile.png',
  심해악어: '/mobs/deepsea-crocodile.png',
  빙하악어: '/mobs/glacier-crocodile.png',
  폭풍악어: '/mobs/storm-crocodile.png',
  '태고의 악어': '/mobs/ancient-crocodile.png',
});

export function mobSpritePath(name: string): string | undefined {
  return Object.hasOwn(MOB_SPRITES, name) ? MOB_SPRITES[name] : undefined;
}
