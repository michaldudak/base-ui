import * as React from 'react';
import { Transition } from 'react-transition-group';
import { useTheme } from '@mui/system';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import CloseIcon from '@mui/icons-material/Close';
import { Snackbar } from '@mui/base/Snackbar';
import { SnackbarCloseReason } from '@mui/base/useSnackbar';

function useIsDarkMode() {
  const theme = useTheme();
  return theme.palette.mode === 'dark';
}

export default function UnstyledSnackbarIntroduction() {
  const isDarkMode = useIsDarkMode();

  const [open, setOpen] = React.useState(false);
  const [exited, setExited] = React.useState(true);
  const nodeRef = React.useRef(null);

  const handleClose = (_: any, reason: SnackbarCloseReason) => {
    if (reason === 'clickaway') {
      return;
    }

    setOpen(false);
  };

  const handleClick = () => {
    setOpen(true);
  };

  const handleOnEnter = () => {
    setExited(false);
  };

  const handleOnExited = () => {
    setExited(true);
  };

  return (
    <div className={`${isDarkMode ? 'dark' : ''}`}>
      <button
        className="cursor-pointer text-sm font-sans box-border rounded-lg font-semibold px-4 py-2 bg-violet-500 hover:bg-violet-600 active:bg-violet-700 text-white border-none leading-normal focus-visible:outline-0 focus-visible:shadow-outline-purple"
        type="button"
        onClick={handleClick}
      >
        Open snackbar
      </button>
      <Snackbar
        autoHideDuration={5000}
        open={open}
        onClose={handleClose}
        exited={exited}
        className="fixed z-50 font-sans flex right-4 bottom-4 left-auto max-w-xl	min-w-xs"
      >
        <Transition
          timeout={{ enter: 400, exit: 400 }}
          in={open}
          appear
          unmountOnExit
          onEnter={handleOnEnter}
          onExited={handleOnExited}
          nodeRef={nodeRef}
        >
          {(status) => (
            <div
              className="flex gap-4	overflow-hidden	bg-slate-50 dark:bg-slate-900 rounded-lg	border border-solid border-slate-200 dark:border-slate-700 shadow-md text-slate-900 dark:text-slate-50 p-3	text-start"
              style={{
                transform: positioningStyles[status],
                transition: 'transform 300ms ease',
              }}
              ref={nodeRef}
            >
              <CheckRoundedIcon
                sx={{
                  color: 'success.main',
                  flexShrink: 0,
                  width: '1.25rem',
                  height: '1.5rem',
                }}
              />
              <div className="flex-1	max-w-full">
                <p className="m-0 leading-normal mr-2 font-medium">
                  Notifications sent
                </p>
                <p className="m-0 leading-normal font-normal	text-slate-800 dark:text-slate-400">
                  Everything was sent to the desired address.
                </p>
              </div>
              <CloseIcon
                onClick={handleClose}
                className="cursor-pointer	shrink-0	p-0.5	rounded hover:bg-slate-50 hover:dark:bg-slate-800"
              />
            </div>
          )}
        </Transition>
      </Snackbar>
    </div>
  );
}

const positioningStyles = {
  entering: 'translateX(0)',
  entered: 'translateX(0)',
  exiting: 'translateX(500px)',
  exited: 'translateX(500px)',
  unmounted: 'translateX(500px)',
};