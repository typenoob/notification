import type { CSSMotionProps } from '@rc-component/motion';
import * as React from 'react';
import type { NotificationsProps, NotificationsRef } from '../Notifications';
import Notifications from '../Notifications';
import type { OpenConfig, Placement, StackConfig } from '../interface';
import { useEvent } from '@rc-component/util';

const defaultGetContainer = () => document.body;

type OptionalConfig = Partial<OpenConfig>;

export interface NotificationConfig {
  prefixCls?: string;
  /** Customize container. It will repeat call which means you should return same container element. */
  getContainer?: () => HTMLElement | ShadowRoot;
  motion?: CSSMotionProps | ((placement: Placement) => CSSMotionProps);

  closable?: boolean | ({ closeIcon?: React.ReactNode } & React.AriaAttributes);
  maxCount?: number;
  duration?: number;
  showProgress?: boolean;
  pauseOnHover?: boolean;
  /** @private. Config for notification holder style. Safe to remove if refactor */
  className?: (placement: Placement) => string;
  /** @private. Config for notification holder style. Safe to remove if refactor */
  style?: (placement: Placement) => React.CSSProperties;
  /** @private Trigger when all the notification closed. */
  onAllRemoved?: VoidFunction;
  stack?: StackConfig;
  /** @private Slot for style in Notifications */
  renderNotifications?: NotificationsProps['renderNotifications'];
}

export interface NotificationAPI {
  open: (config: OptionalConfig) => void;
  close: (key: React.Key) => void;
  destroy: () => void;
}

interface OpenTask {
  type: 'open';
  config: OpenConfig;
}

interface CloseTask {
  type: 'close';
  key: React.Key;
}

interface DestroyTask {
  type: 'destroy';
}

type Task = OpenTask | CloseTask | DestroyTask;

let uniqueKey = 0;

function mergeConfig<T>(...objList: Partial<T>[]): T {
  const clone: T = {} as T;

  objList.forEach((obj) => {
    if (obj) {
      Object.keys(obj).forEach((key) => {
        const val = obj[key];

        if (val !== undefined) {
          clone[key] = val;
        }
      });
    }
  });

  return clone;
}

export default function useNotification(
  rootConfig: NotificationConfig = {},
): [NotificationAPI, React.ReactElement] {
  const {
    getContainer = defaultGetContainer,
    motion,
    prefixCls,
    maxCount,
    className,
    style,
    onAllRemoved,
    stack,
    renderNotifications,
    ...shareConfig
  } = rootConfig;

  const [container, setContainer] = React.useState<HTMLElement | ShadowRoot>();
  const notificationsRef = React.useRef<NotificationsRef>();
  const contextHolder = (
    <Notifications
      container={container}
      ref={notificationsRef}
      prefixCls={prefixCls}
      motion={motion}
      maxCount={maxCount}
      className={className}
      style={style}
      onAllRemoved={onAllRemoved}
      stack={stack}
      renderNotifications={renderNotifications}
    />
  );

  const [taskQueue, setTaskQueue] = React.useState<Task[]>([]);

  const open = useEvent<NotificationAPI['open']>((config) => {
    const mergedConfig = mergeConfig(shareConfig, config);
    if (mergedConfig.key === null || mergedConfig.key === undefined) {
      mergedConfig.key = `rc-notification-${uniqueKey}`;
      uniqueKey += 1;
    }

    setTaskQueue((queue) => [...queue, { type: 'open', config: mergedConfig }]);
  });

  // ========================= Refs =========================
  const api = React.useMemo<NotificationAPI>(
    () => ({
      open: open,
      close: (key) => {
        setTaskQueue((queue) => [...queue, { type: 'close', key }]);
      },
      destroy: () => {
        setTaskQueue((queue) => [...queue, { type: 'destroy' }]);
      },
    }),
    [],
  );

  // ======================= Container ======================
  // React 18 should all in effect that we will check container in each render
  // Which means getContainer should be stable.
  React.useEffect(() => {
    setContainer(getContainer());
  });

  // ======================== Effect ========================
  React.useEffect(() => {
    // Flush task when node ready
    if (notificationsRef.current && taskQueue.length) {
      taskQueue.forEach((task) => {
        switch (task.type) {
          case 'open':
            notificationsRef.current.open(task.config);
            break;

          case 'close':
            notificationsRef.current.close(task.key);
            break;

          case 'destroy':
            notificationsRef.current.destroy();
            break;
        }
      });

      // https://github.com/ant-design/ant-design/issues/52590
      // React `startTransition` will run once `useEffect` but many times `setState`,
      // So `setTaskQueue` with filtered array will cause infinite loop.
      // We cache the first match queue instead.
      let oriTaskQueue: Task[];
      let tgtTaskQueue: Task[];

      // React 17 will mix order of effect & setState in async
      // - open: setState[0]
      // - effect[0]
      // - open: setState[1]
      // - effect setState([]) * here will clean up [0, 1] in React 17
      setTaskQueue((oriQueue) => {
        if (oriTaskQueue !== oriQueue || !tgtTaskQueue) {
          oriTaskQueue = oriQueue;
          tgtTaskQueue = oriQueue.filter((task) => !taskQueue.includes(task));
        }

        return tgtTaskQueue;
      });
    }
  }, [taskQueue]);

  // ======================== Return ========================
  return [api, contextHolder];
}
