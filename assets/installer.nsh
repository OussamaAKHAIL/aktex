# AKTeX NSIS hooks
#
# Installing over a running copy is the most common Windows install failure:
# the old AKTeX.exe keeps handles on app/uninstaller files, producing
# "Error opening file for writing" and "AKTeX cannot be closed" dialogs.
#
# electron-builder's default check asks the user to close the app and retries.
# The app autosaves every 550 ms, so a forced close is safe here and makes
# upgrades deterministic. The default taskkill path is not used because it can
# fail silently for child processes or a stale uninstaller.

!macro customInit
  # A previous install may have left read-only installer/uninstaller files.
  SetFileAttributes "$INSTDIR\AKTeX.exe" NORMAL
  SetFileAttributes "$INSTDIR\Uninstall AKTeX.exe" NORMAL
  SetFileAttributes "$INSTDIR\uninstallerIcon.ico" NORMAL
!macroend

!macro customCheckAppRunning
  DetailPrint "Closing running AKTeX..."
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM "AKTeX.exe" /T'
  Pop $0
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM "Uninstall AKTeX.exe" /T'
  Pop $0
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM "Un_A.exe" /T'
  Pop $0
  Sleep 1200
!macroend

!macro customUnInit
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM "AKTeX.exe" /T'
  Pop $0
  Sleep 600
!macroend
