const PHONE_IDENTITY = 'intake:phone:';

export const opaquePhoneIdentity = id => PHONE_IDENTITY+id;
export const isPhoneIdentity = value => typeof value==='string' && value.startsWith(PHONE_IDENTITY);
export const contactEmail = value => typeof value==='string' && !isPhoneIdentity(value) ? value : '';
