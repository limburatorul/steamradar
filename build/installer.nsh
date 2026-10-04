;   Closes SteamRadar before installing over it (copied from Shelf).
;
; Electron runs several processes under one executable name and only one owns a
; window; the stock check closes a windowless helper, sees the name still running
; and gives up with "cannot be closed". So: ask politely for ~5 s, then terminate
; whatever helper is left. State is written when it changes, not on exit, so
; nothing is lost. None of this runs when the update starts from inside the app:
; that path quits first and hands the installer a machine with nothing to close.

!macro customCheckAppRunning
  DetailPrint "Closing SteamRadar..."

  ; Politely, up to ~5 seconds.
  StrCpy $R9 0
  ${Do}
    nsProcess::_FindProcess "${APP_EXECUTABLE_FILENAME}"
    Pop $R0
    ${If} $R0 != 0
      ${Break}                     ; nothing of ours is running
    ${EndIf}

    nsProcess::_CloseProcess "${APP_EXECUTABLE_FILENAME}"
    Pop $R0
    Sleep 500
    IntOp $R9 $R9 + 1
    ${If} $R9 >= 10
      ${Break}
    ${EndIf}
  ${Loop}

  ; Whatever is left is a windowless helper. Take it.
  nsProcess::_FindProcess "${APP_EXECUTABLE_FILENAME}"
  Pop $R0
  ${If} $R0 == 0
    DetailPrint "Closing background processes..."
    StrCpy $R9 0
    ${Do}
      nsProcess::_KillProcess "${APP_EXECUTABLE_FILENAME}"
      Pop $R0
      Sleep 400
      nsProcess::_FindProcess "${APP_EXECUTABLE_FILENAME}"
      Pop $R0
      ${If} $R0 != 0
        ${Break}
      ${EndIf}
      IntOp $R9 $R9 + 1
      ${If} $R9 >= 8
        ${Break}                   ; fall through to the stock prompt
      ${EndIf}
    ${Loop}
  ${EndIf}
!macroend
