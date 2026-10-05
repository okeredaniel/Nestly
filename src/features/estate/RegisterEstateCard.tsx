import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import BottomCard, { SheetSuccess, SheetTitle } from '../../components/ui/BottomCard';
import AppTextField from '../../components/ui/AppTextField';
import PrimaryButton from '../../components/ui/PrimaryButton';
import { colors, typography } from '../../theme';
import { createEstate, friendlyEstateError } from './estateService';

type Props = { visible: boolean; onClose: () => void };
type Errors = { name?: string; address?: string; units?: string; form?: string };

export default function RegisterEstateCard({ visible, onClose }: Props) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [units, setUnits] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [loading, setLoading] = useState(false);
  const [createdCode, setCreatedCode] = useState<string | null>(null);

  useEffect(() => {
    if (visible) return;
    const t = setTimeout(() => {
      setName('');
      setAddress('');
      setUnits('');
      setErrors({});
      setLoading(false);
      setCreatedCode(null);
    }, 300);
    return () => clearTimeout(t);
  }, [visible]);

  const submit = async () => {
    const e: Errors = {};
    if (name.trim().length < 3) e.name = 'Enter your estate name';
    if (address.trim().length < 3) e.address = 'Enter the estate address or area';
    if (units.trim() && !/^\d+$/.test(units.trim())) e.units = 'Enter a number';
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setLoading(true);
    try {
      const { code } = await createEstate({
        name: name.trim(),
        address: address.trim(),
        units: units.trim() ? Number(units.trim()) : null,
      });
      setCreatedCode(code);
    } catch (err: any) {
      setErrors({ form: friendlyEstateError(err) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <BottomCard visible={visible} onClose={onClose}>
      {createdCode ? (
        <SheetSuccess
          icon="business-outline"
          title="Estate created"
          text={`${name.trim()} is ready, and you're its admin. Share this code so residents can request to join.`}
        >
          <View style={styles.codeBox}>
            <Text style={styles.code}>{createdCode}</Text>
          </View>
          <PrimaryButton
            title="Continue"
            onPress={() => {
              onClose();
              router.replace('/home' as any);
            }}
            style={{ alignSelf: 'stretch' }}
          />
        </SheetSuccess>
      ) : (
        <>
          <SheetTitle
            title="Register your estate"
            subtitle="Create an estate as an administrator or manager."
          />
          <AppTextField
            label="Estate name"
            value={name}
            onChangeText={setName}
            placeholder="e.g. Palm Grove Estate"
            autoCapitalize="words"
            error={errors.name}
          />
          <AppTextField
            label="Address or area"
            value={address}
            onChangeText={setAddress}
            placeholder="Street, area, city"
            autoCapitalize="words"
            error={errors.address}
          />
          <AppTextField
            label="Number of units (optional)"
            value={units}
            onChangeText={setUnits}
            placeholder="e.g. 120"
            keyboardType="number-pad"
            error={errors.units}
          />
          {!!errors.form && <Text style={styles.formError}>{errors.form}</Text>}
          <PrimaryButton
            title="Create estate"
            onPress={submit}
            loading={loading}
            style={{ marginBottom: 8 }}
          />
        </>
      )}
    </BottomCard>
  );
}

const styles = StyleSheet.create({
  codeBox: {
    alignSelf: 'stretch',
    backgroundColor: colors.primarySoft,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  code: { ...typography.h2, color: colors.primary, letterSpacing: 3 },
  formError: {
    ...typography.caption,
    color: colors.danger,
    textAlign: 'center',
    marginBottom: 10,
  },
});
