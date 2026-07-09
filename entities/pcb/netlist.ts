import { EncoderNetAssignment, MatrixAssignment } from '@entities/pcb/types'

export const orderPhysicalKeys = (matrix: MatrixAssignment) =>
    matrix.perKey
        .map((assignment, index) => ({ index, row: assignment.row, col: assignment.col }))
        .filter((entry) => entry.row >= 0 && entry.col >= 0)
        .sort((left, right) => left.row - right.row || left.col - right.col || left.index - right.index)
        .map((entry) => entry.index)

export const buildNetlist = (matrix: MatrixAssignment, isEncoder: boolean[] = []) => {
    const nets = ['']
    for (let row = 0; row < matrix.rows; row++) nets.push(`ROW${row}`)
    for (let col = 0; col < matrix.cols; col++) nets.push(`COL${col}`)

    const order = orderPhysicalKeys(matrix)
    const switchNets = order.map((keyIndex, ordinal) => {
        const { row, col } = matrix.perKey[keyIndex]
        const junctionNet = 1 + matrix.rows + matrix.cols + ordinal
        nets.push(`N_R${row}_C${col}`)
        return { colNet: 1 + matrix.rows + col, junctionNet, rowNet: 1 + row }
    })

    const encoderNets: (EncoderNetAssignment | null)[] = order.map(() => null)
    const hasEncoder = order.some((keyIndex) => isEncoder[keyIndex])
    let gndNet = -1
    if (hasEncoder) {
        nets.push('GND')
        gndNet = nets.length - 1
        let encoderIndex = 0
        order.forEach((keyIndex, ordinal) => {
            if (!isEncoder[keyIndex]) return
            nets.push(`ENC${encoderIndex}_A`)
            const aNet = nets.length - 1
            nets.push(`ENC${encoderIndex}_B`)
            const bNet = nets.length - 1
            encoderNets[ordinal] = { encoderIndex, aNet, bNet, gndNet }
            encoderIndex++
        })
    }

    return { nets, switchNets, encoderNets, gndNet }
}
