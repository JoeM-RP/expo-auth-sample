import * as SecureStore from "expo-secure-store";
import { Linking, Pressable, StyleSheet } from 'react-native';

import { Image } from 'expo-image';
import { Text, View } from '@/components/Themed';
import { useSession } from '@/store/contexts';
import Colors from '@/constants/Colors';
import { blurhash, useRefreshOnFocus } from '@/utils';
import { useEffect, useState } from 'react';
import { useQuery } from "@tanstack/react-query";
import { getProfileInfoAsync } from "@/services/MiddlewareAPIService";

export default function TabOneScreen() {
  const { userInfo, session, signOut } = useSession();
  const token = SecureStore.getItem("accessToken");

  const { isPending, isError, data, error, refetch, isRefetching } = useQuery({
    queryKey: ["user-details"],
    queryFn: async ({ signal }) => {
        const result = await getProfileInfoAsync()
        console.info(result);

        return [];
    },
  })

  useRefreshOnFocus(refetch);

  useEffect(() => {
    // console.info(userInfo)
    // console.info("Bearer " + session)
  }, [userInfo, session, token])

  const onEmailTapped = () => {
    const composed = "mailto:" + userInfo.email;

    if (!userInfo.email || !Linking.canOpenURL(composed)){
      // show alert/error
      console.warn("Couldn't open email address: " + composed)
      return
    }
    
    Linking.openURL(composed).catch((error: any) => {
      // show alert/error
      console.error(error.message);
    });

    return;
  }

  return (
    <View style={styles.container}>
      <Image
        style={styles.image}
        source={{
          uri: userInfo?.picture,
          headers: {
            Authorization: `Bearer ${session}`
          }
        }}
        placeholder={{ blurhash }}
        contentFit="cover"
        transition={1000}
        onLoadStart={() => {
        }}
        onError={(e: any) => {
          console.warn("[(tab)/index] " + e.error + " for URL: " + userInfo?.picture + `${session ? ". Token set" : ". Token not set"}`);
        }}
      />
      <Text style={styles.title}>Welcome, {userInfo?.name || "user"}</Text>
      <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />

      <Text style={styles.info}>{"email:" + " "}
          <Text lightColor={Colors.light.tint} onPress={() => onEmailTapped()}>
            {userInfo?.email || "email"}
          </Text>
      </Text>
      <Pressable onPress={signOut} style={{marginTop: 100}}>
        <Text>Sign Out</Text>
      </Pressable>
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
  info: {
    fontSize: 17,
    lineHeight: 24,
    textAlign: 'center',
  },
  separator: {
    marginVertical: 30,
    height: 1,
    width: '80%',
  },
  image: {
    width: 150,
    height: 150,
    backgroundColor: '#0553',
    marginBottom: 14
  },
});
