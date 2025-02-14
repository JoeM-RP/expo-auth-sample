import { Button, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import { useSession } from '@/store/contexts';
import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';

export default function SignIn() {
    const { signIn, session, signOut } = useSession();
    const { force } = useLocalSearchParams();

    const [signInBusy, setSignInBusy] = useState(false);

    useEffect(() => {
        if (force && session) {
            console.debug(
                "[sign-in] Forcing sign-in screen after detecting flag even with session present",
            );

            signOut();
        }

        if (session) {
            console.debug("[sign-in] Redirect to home screen after detecting session");
            router.push("/(app)/(tabs)");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session, force]);
    
    const signInFlow = async () => {
        setSignInBusy(true);

        const result = await signIn();

        if (result) {
            console.debug("[sign-in] Signed in successfully!");
            // useEffect will handle the navigation
        }

        setSignInBusy(false);
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Welcome</Text>
            <Button title="Sign in" onPress={signInFlow} disabled={signInBusy}/>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
    },
    separator: {
        marginVertical: 30,
        height: 1,
        width: '80%',
    },
});