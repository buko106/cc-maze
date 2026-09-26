import { Component } from '@angular/core'
import { PALETTE } from '../../lib/maze/renderer'

/** What each colour on the maze means, taken from the palette the renderer paints with. */
@Component({
  selector: 'app-maze-legend',
  templateUrl: './maze-legend.html',
  styleUrl: './maze-legend.css',
})
export class MazeLegend {
  protected readonly groups = [
    {
      title: '生成',
      items: [
        { color: PALETTE.rock, label: '未踏' },
        { color: PALETTE.frontier, label: '候補' },
        { color: PALETTE.trail, label: '掘削中の経路' },
        { color: PALETTE.corridor, label: '確定した通路' },
        { color: PALETTE.start, label: 'スタート (S)' },
        { color: PALETTE.goal, label: 'ゴール (G)' },
      ],
    },
    {
      title: '探索',
      items: [
        { color: PALETTE.searched, label: '探索済み' },
        { color: PALETTE.fringe, label: 'フロンティア' },
        // Only the bidirectional search paints these two
        { color: PALETTE.searchedBack, label: '探索済み（ゴール側）' },
        { color: PALETTE.fringeBack, label: 'フロンティア（ゴール側）' },
        { color: PALETTE.route, label: '経路' },
        { color: PALETTE.active, label: '注目セル' },
      ],
    },
  ] as const
}
