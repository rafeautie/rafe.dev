import { REGEXP_ONLY_DIGITS_AND_CHARS } from 'input-otp'
import { useCallback, useState } from 'react'
import { ReadyState } from 'react-use-websocket'
import { useRaceWebsocketSubscription } from '../hooks/useRaceWebsocketSubscription'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface MenuProps {
  roomId?: string
  allowCreateRoom?: boolean
}

export const Menu = ({
  roomId: defaultRoomId,
  allowCreateRoom = false,
}: MenuProps) => {
  const [isJoiningExistingRoom, setIsJoiningExistingRoom] = useState(false)
  const [roomId, setRoomId] = useState(defaultRoomId)

  const { createRoom, joinRoom, readyState } = useRaceWebsocketSubscription({
    shouldTrackMessages: defaultRoomId == null,
  })

  const onJoinRace = useCallback(() => {
    if (!roomId) {
      return
    }
    setIsJoiningExistingRoom(true)
    joinRoom(roomId)
  }, [joinRoom, roomId])

  const onRoomCodeChange = useCallback(
    (value: string) => {
      setRoomId(value)
    },
    [setRoomId],
  )

  const isConnecting = readyState === ReadyState.CONNECTING
  const isConnectingToExistingRoom =
    readyState === ReadyState.CONNECTING && isJoiningExistingRoom

  return (
    <div className="flex flex-col justify-center items-center gap-10 h-full">
      <Card className="dark:bg-neutral-900 w-[420px]">
        <CardHeader>
          <CardTitle>Enter Room Code</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-8">
            <InputOTP
              value={roomId}
              onChange={onRoomCodeChange}
              maxLength={6}
              minLength={6}
              pattern={REGEXP_ONLY_DIGITS_AND_CHARS}
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
            <Button
              className="flex-1"
              disabled={isConnectingToExistingRoom || (roomId?.length ?? 0) < 6}
              onClick={onJoinRace}
            >
              {isConnectingToExistingRoom ? <Spinner /> : null}
              Join Race
            </Button>
          </div>
        </CardContent>
      </Card>
      {allowCreateRoom && (
        <>
          <div className="flex justify-center items-center gap-5">
            <Separator className="max-w-xl" />
            <p className="text-lg">or</p>
            <Separator className="max-w-xl" />
          </div>
          <Button
            disabled={isConnecting && !isConnectingToExistingRoom}
            onClick={createRoom}
            size="lg"
          >
            {isConnecting && !isConnectingToExistingRoom ? <Spinner /> : null}
            Create Race
          </Button>
        </>
      )}
    </div>
  )
}
