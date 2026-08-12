import { sendRoomSnapshot } from '../roomSnapshot.js';
import type { CommandContext } from './context.js';

export function describeRoom(ctx: CommandContext): void {
  sendRoomSnapshot(ctx);
}

export function showHelp(ctx: CommandContext): void {
  ctx.send({
    type: 'text',
    text: [
      '사용 가능한 명령어:',
      'look (l) - 현재 방을 다시 살펴봅니다.',
      'north/south/east/west/up/down (w/a/s/d, u) - 이동합니다. (w=북, a=서, s=남, d=동)',
      'say <메시지> - 같은 방에 있는 사람에게 말합니다.',
      'shout <메시지> - 접속 중인 모든 사람에게 외칩니다.',
      'tell <이름> <메시지> - 접속 중인 특정 유저에게 귓속말을 합니다.',
      'who - 현재 접속 중인 사람 목록을 봅니다.',
      'attack <대상> - 몬스터를 공격합니다.',
      'flee - 전투에서 도망칩니다.',
      'rest - 자리를 잡고 쉬며 체력/마나를 서서히 회복합니다. (전투하거나 이동하면 중단)',
      'get/drop <아이템> - 아이템을 줍거나 버립니다.',
      'inventory (inv) - 소지품을 확인합니다.',
      'equip <아이템> - 무기/방어구를 장착합니다.',
      'use <아이템> - 소비 아이템을 사용합니다.',
      'shop - 같은 방에 있는 상인의 판매 목록을 봅니다.',
      'buy <아이템> - 상인에게서 아이템을 구매합니다.',
      'sell <아이템> - 상인에게 아이템을 판매합니다.',
      'village found <이름> - (미개척지) 새 마을을 세웁니다.',
      'village list - 세워진 마을 목록을 봅니다.',
      'village join <마을이름> - 그 마을에 가입합니다.',
      'village quit - 소속 마을에서 탈퇴합니다. (영주는 불가)',
      'village members - 소속 마을원 목록을 봅니다.',
      'village deposit <금액> - 소속 마을 국고에 gold를 기부합니다.',
      'village land buy - (영주) 땅을 삽니다.',
      'village build <칸번호> <종류> - (영주) 건물을 짓습니다. (초소=watchtower는 수비대 자리)',
      'village garrison add <몬스터> - (영주) 수비대를 고용합니다.',
      'village garrison list - 수비대 현황을 봅니다.',
      'village garrison remove <몬스터> - (영주) 수비대를 해고합니다.',
      'village upgrade - (영주) 마을을 업그레이드합니다. (레벨 3부터 습격 가능/피습 가능/누구나 출입 가능)',
      'village transfer <이름> - (영주) 다른 마을원에게 영주 자리를 위임합니다.',
      'village disband - (영주) 마을을 완전히 해체합니다.',
      'travel <마을이름> - (미개척지) 마을로 이동합니다. (레벨 3 미만은 마을원만)',
      'leave - 마을에서 미개척지로 돌아갑니다.',
      'enter <이름> (e) - 방에 있는 연결점(포털)을 통해 이동합니다.',
      'raid <마을이름> - (영주) 레벨 3+ 마을을 습격합니다.',
      'stat <str|dex|int|vit|wis|luk> <수치> - 미분배 스탯 포인트를 분배합니다.',
      'skill list - 직업 스킬 목록과 습득 현황을 봅니다.',
      'skill learn <스킬 ID> - 스킬 포인트로 스킬을 배웁니다.',
      'cast <스킬 ID> - 배운 스킬을 사용합니다. (전투 중: 공격기 / 평시에도 가능: 회복기)',
      '마법 <스킬 이름> [대상] - 스킬 이름으로 편하게 사용합니다. 예) 마법 파이어볼 써, 마법 파이어볼 고블린',
      '  전투 중이 아니어도 대상을 지정하면 공격기로 선공을 걸 수 있습니다.',
      'help - 이 도움말을 봅니다.',
    ].join('\n'),
  });
}
