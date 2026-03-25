import { useEffect, useState } from 'react';
import {
  getHideCogsFromProposalBuilder,
  saveHideCogsFromProposalBuilder,
  subscribeToAdminCogsViewUpdates,
} from '../services/adminCogsView';
import { readSession } from '../services/session';

type UseAdminCogsViewOptions = {
  franchiseId?: string;
  userId?: string;
  userEmail?: string;
  userName?: string;
};

export function useAdminCogsView(options: UseAdminCogsViewOptions = {}) {
  const session = readSession();
  const resolvedUserId = options.userId || session?.userId;
  const resolvedUserEmail = options.userEmail || session?.userEmail;
  const resolvedUserName = options.userName || session?.userName;
  const scopeOptions = {
    franchiseId: options.franchiseId,
    userId: resolvedUserId,
    userEmail: resolvedUserEmail,
    userName: resolvedUserName,
  };

  const [hideCogsFromProposalBuilder, setHideCogsFromProposalBuilderState] = useState<boolean>(() =>
    getHideCogsFromProposalBuilder(scopeOptions)
  );

  useEffect(() => {
    setHideCogsFromProposalBuilderState(getHideCogsFromProposalBuilder(scopeOptions));
    return subscribeToAdminCogsViewUpdates(scopeOptions, (nextValue) => {
      setHideCogsFromProposalBuilderState(nextValue);
    });
  }, [options.franchiseId, resolvedUserId, resolvedUserEmail, resolvedUserName]);

  const setHideCogsFromProposalBuilder = (nextValue: boolean) => {
    const savedValue = saveHideCogsFromProposalBuilder(nextValue, scopeOptions);
    setHideCogsFromProposalBuilderState(savedValue);
    return savedValue;
  };

  return {
    hideCogsFromProposalBuilder,
    setHideCogsFromProposalBuilder,
  };
}
