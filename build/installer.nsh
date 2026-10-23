; SteamRadar installs for every user in Program Files\ProtagonistLabs\SteamRadar
; and keeps its data in %APPDATA%\ProtagonistLabs\SteamRadar (vault:
; Ecosistem-v3-foldere.md). An old per-user copy is replaced by electron-builder
; itself: it runs that copy's uninstaller with --updated, which removes the
; program and its shortcuts and never the data (deleteAppDataOnUninstall was
; never set).

; A first per-machine install goes to the studio's folder; a later one stays
; where the registry says. A /D= naming the old per-user folder (what the
; updater of 0.6-0.8 passes) is ignored the same way.
!macro customInit
  Var /GLOBAL fromOldUpdater
  ReadRegStr $0 HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
  ReadRegStr $1 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${StdUtils.GetParameter} $2 "D" ""
  StrCpy $fromOldUpdater 0
  ${If} $0 == ""
    ${If} $2 != ""
    ${AndIf} $2 == $1
      StrCpy $fromOldUpdater 1
    ${EndIf}
    ${If} $2 == ""
    ${OrIf} $fromOldUpdater == 1
      StrCpy $INSTDIR "$PROGRAMFILES64\ProtagonistLabs\${APP_FILENAME}"
    ${EndIf}
  ${EndIf}
!macroend

; Once, by rename (same drive, instant). A new folder that already has data is
; never mixed into, and a locked file leaves the move to the app's next start.
!macro moveDataFolder FROM TO
  RMDir "${TO}"
  ${IfNot} ${FileExists} "${TO}\*.*"
  ${AndIf} ${FileExists} "${FROM}\*.*"
    ClearErrors
    Rename "${FROM}" "${TO}"
    ${If} ${Errors}
      DetailPrint "Could not move ${FROM}; the app moves it at its next start."
    ${EndIf}
  ${EndIf}
!macroend

!macro customInstall
  ; The installer runs elevated as the user who installs; the data is that user's.
  SetShellVarContext current
  CreateDirectory "$APPDATA\ProtagonistLabs"
  !insertmacro moveDataFolder "$APPDATA\steamradar" "$APPDATA\ProtagonistLabs\${APP_FILENAME}"
  SetShellVarContext all
  ; The old updater restarts the copy it knew, which is gone now: start this one.
  ${If} $fromOldUpdater == 1
  ${AndIf} ${Silent}
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" ""
  ${EndIf}
!macroend

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
